using System;
using System.Collections.Generic;

namespace SLR.Domain
{
    public sealed class Simulation
    {
        public WorldState State { get; private set; }
        public WorldState Checkpoint { get; private set; }
        public readonly List<WorldEvent> Events = new List<WorldEvent>();
        public event Action<WorldState> CheckpointReached;
        public event Action<string> MissionCompleted;
        public Simulation(WorldState saved = null)
        {
            State = saved?.Clone() ?? new WorldState();
            if (saved == null)
            {
                AddResidue(new Point(-10, -12), 12, 99999);
                Spawn(EnemyKind.Chaser, -5, -10); Spawn(EnemyKind.Chaser, 5, -10);
                Spawn(EnemyKind.Chaser, -5, 0); Spawn(EnemyKind.Chaser, 5, 0); Spawn(EnemyKind.Chaser, 0, 2);
                Spawn(EnemyKind.Artillery, -7, 5); Spawn(EnemyKind.Artillery, 7, 5);
            }
            Checkpoint = State.Clone();
        }
        public void Retry() { State = Checkpoint.Clone(); Events.Clear(); }
        public static int Collect(WorldState s, Residue token)
        {
            int n = Math.Max(0, Math.Min(Rules.MaxEnergy - s.energy, token.amount));
            token.amount -= n; s.energy += n; s.collected += n; return n;
        }
        void Emit(string kind, Point from, Point to, string message = "") => Events.Add(new WorldEvent(kind, from, to, message));
        void Note(string text) => Emit("note", State.player, State.player, text);
        void SaveCheckpoint(string text)
        {
            State.hp = Rules.MaxHp; State.stamina = 100;
            Checkpoint = State.Clone(); CheckpointReached?.Invoke(Checkpoint.Clone()); Note(text);
        }
        public EnemyState Spawn(EnemyKind kind, float x, float z)
        {
            int hp = kind == EnemyKind.Forklift ? 1400 : kind == EnemyKind.Chaser ? 60 : 90;
            var e = new EnemyState { id = State.nextId++, kind = kind, hp = hp, maxHp = hp,
                armor = kind == EnemyKind.Forklift ? 20 : kind == EnemyKind.Artillery ? 10 : 0,
                position = new Point(x, z), timer = .7f };
            State.enemies.Add(e); return e;
        }
        void AddResidue(Point p, int amount, float life = 20) => State.residues.Add(new Residue { id = State.nextId++, position = p, amount = amount, life = life });

        public void Tick(float dt, PlayerInput input)
        {
            Events.Clear(); var s = State;
            if (s.dead || s.stage == MissionStage.Complete) return;
            dt = Rules.Clamp(dt, 0, .05f); s.time += dt;
            s.attackCooldown = Math.Max(0, s.attackCooldown - dt); s.pullCooldown = Math.Max(0, s.pullCooldown - dt);
            s.shieldCooldown = Math.Max(0, s.shieldCooldown - dt); s.shieldTime = Math.Max(0, s.shieldTime - dt);
            s.staminaDelay = Math.Max(0, s.staminaDelay - dt);
            if (s.staminaDelay == 0) s.stamina = Math.Min(100, s.stamina + 20 * dt);
            if (s.shieldTime == 0) s.shield = 0;
            if (input.aim.Length > .01f) s.facing = input.aim.Normalized;
            if (input.dodge && s.dodge <= 0 && s.stamina >= 25)
            {
                s.dodge = .35f; s.stamina -= 25; s.staminaDelay = 1;
                s.dodgeDirection = input.move.Length > .01f ? input.move.Normalized : s.facing;
                s.channel = 0; Emit("dash", s.player, s.player + s.dodgeDirection * 3.2f);
            }
            if (s.dodge > 0)
            {
                float step = Math.Min(s.dodge, dt); s.dodge -= step;
                s.player = Level.Move(s, s.player, s.dodgeDirection * (3.2f / .35f * step));
            }
            else
            {
                var motion = input.move.Length > 1 ? input.move.Normalized : input.move;
                s.player = Level.Move(s, s.player, motion * Rules.Speed * (input.reclaim ? .5f : 1) * dt);
                if (input.reclaim) Reclaim(dt); else s.channel = 0;
                if (!input.reclaim)
                {
                    if (input.attack && s.attackCooldown == 0) Attack();
                    if (input.pull && s.pullCooldown == 0) Pull();
                    if (input.shield && s.shieldCooldown == 0) Shield();
                }
                if (input.interact) Interact();
            }
            for (int i = 0; i < s.enemies.Count; i++) UpdateEnemy(s.enemies[i], dt);
            for (int i = s.residues.Count - 1; i >= 0; i--)
            { s.residues[i].life -= dt; if (s.residues[i].amount <= 0 || s.residues[i].life <= 0) s.residues.RemoveAt(i); }
            if (s.hp <= 0) { s.dead = true; return; }
            Mission(dt);
        }
        void Reclaim(float dt)
        {
            var s = State; s.channel += dt;
            if (s.channel < Rules.ReclaimChannel || s.energy >= 100) return;
            foreach (var r in s.residues)
                if (r.amount > 0 && Rules.Near(r.position, s.player, Rules.ReclaimRange) && Level.Visible(s, r.position, s.player))
                    if (Collect(s, r) > 0) Emit("reclaim", r.position, s.player);
        }
        EnemyState Target(float range)
        {
            EnemyState best = null; float distance = range;
            foreach (var e in State.enemies)
            {
                var offset = e.position - State.player; float d = offset.Length;
                if (e.hp <= 0 || d > distance || Point.Dot(offset.Normalized, State.facing) < .45f || !Level.Visible(State, State.player, e.position)) continue;
                best = e; distance = d;
            }
            return best;
        }
        void Attack()
        {
            State.attackCooldown = .5f; var e = Target(2.8f);
            Emit("attack", State.player, e != null ? e.position : State.player + State.facing * 2.2f);
            if (e != null) Hit(e, 1);
        }
        void Hit(EnemyState e, float coefficient)
        {
            if (e.hp <= 0) return;
            int damage = Rules.Damage(20, coefficient, e.vulnerable > 0 ? 0 : e.armor);
            e.hp = Math.Max(0, e.hp - damage); Emit("hit", e.position, e.position, damage.ToString());
            if (e.hp == 0)
            {
                e.phase = EnemyPhase.Dead; State.kills++; AddResidue(e.position, e.kind == EnemyKind.Forklift ? 40 : 8);
                Emit("break", e.position, e.position);
            }
        }
        void Pull()
        {
            var s = State;
            bool shelf = !s.shelfMoved && s.stage >= MissionStage.Warehouse && Rules.Near(s.player, Level.Shelf, 8);
            var target = Target(8);
            if (!shelf && target == null) { Note("견인할 적을 조준하거나 선반 가까이 이동하세요."); return; }
            if (s.energy < 12) { Note("에너지 12가 필요합니다. 우클릭으로 잔향을 회수하세요."); return; }
            s.energy -= 12; s.pullCooldown = 4;
            if (shelf) { s.shelfMoved = true; Emit("pull", s.player, Level.Shelf); Note("선반 이동 완료. 창고 내부를 정리하세요."); }
            else
            {
                Emit("pull", s.player, target.position); Hit(target, 1.2f);
                if (target.kind != EnemyKind.Forklift && target.hp > 0)
                {
                    var delta = s.player - target.position;
                    target.position = Level.Move(s, target.position, delta.Normalized * Math.Min(3, Math.Max(0, delta.Length - 1)));
                    target.phase = EnemyPhase.Recover; target.timer = 1.5f;
                }
            }
        }
        void Shield()
        {
            var s = State;
            if (s.energy < 20) { Note("잔금막에는 에너지 20이 필요합니다."); return; }
            s.energy -= 20; s.shieldCooldown = 8;
            if (s.stage == MissionStage.Supports && !s.supportA && Rules.Near(s.player, Level.SupportA, 2.3f))
            { s.supportA = true; Emit("support", Level.SupportA, Level.SupportA); Note("서쪽 지지점 고정 완료."); }
            else if (s.stage == MissionStage.Supports && !s.supportB && Rules.Near(s.player, Level.SupportB, 2.3f))
            { s.supportB = true; Emit("support", Level.SupportB, Level.SupportB); Note("동쪽 지지점 고정 완료."); }
            else { s.shield = 70; s.shieldTime = 3; Emit("shield", s.player, s.player + s.facing * 2); }
        }
        void Interact()
        {
            var s = State;
            if (!s.batteryTaken && s.stage >= MissionStage.Supports && Rules.Near(s.player, Level.Battery, 2.5f))
            { s.batteryTaken = true; s.energy = Math.Min(100, s.energy + 40); Note("구조용 배터리 +40. 지지점 옆에서 Q를 사용하세요."); }
            if (s.stage == MissionStage.Exit && s.rescued == 7 && Rules.Near(s.player, Level.Exit, 3))
            {
                s.stage = MissionStage.Complete;
                if (!s.rewardCommitted) { s.rewardCommitted = true; MissionCompleted?.Invoke(s.instanceId); }
                SaveCheckpoint("일곱 명 전원 귀환. 임무 완료.");
            }
        }
        void Mission(float dt)
        {
            var s = State;
            if (s.stage == MissionStage.Reclaim && s.collected > 0)
            { s.stage = MissionStage.Warehouse; SaveCheckpoint("첫 회수 성공 · 체크포인트 1. F로 창고 입구 선반을 옮기세요."); }
            if (s.stage == MissionStage.Warehouse && s.shelfMoved && s.enemies.TrueForAll(e => e.hp == 0))
            {
                s.stage = MissionStage.Supports; s.player = new Point(0, 1); s.energy = Math.Max(s.energy, 40);
                SaveCheckpoint("창고 확보 · 체크포인트 2. 두 지지점 가까이서 Q로 잔금막을 설치하세요.");
            }
            if (s.stage == MissionStage.Supports && s.supportA && s.supportB)
            {
                s.stage = MissionStage.Evacuation;
                Spawn(EnemyKind.Chaser, -6, 3); Spawn(EnemyKind.Chaser, 6, 3);
                Note("대피 시작. 20초 동안 연결 통로를 지키세요.");
            }
            if (s.stage == MissionStage.Evacuation)
            {
                s.evacuation += dt; s.rescued = Math.Min(7, (int)(s.evacuation / 20 * 7));
                foreach (var e in s.enemies)
                    if (e.hp > 0 && Rules.Near(e.position, new Point(0, 6), 4)) s.danger += dt * 5;
                if (s.danger >= 100) { s.dead = true; Note("대피 통로가 붕괴했습니다."); return; }
                if (s.evacuation >= 20)
                {
                    s.rescued = 7; s.stage = MissionStage.Boss;
                    foreach (var e in s.enemies) e.hp = 0;
                    s.player = new Point(0, 14); s.energy = Math.Max(s.energy, 40);
                    Spawn(EnemyKind.Forklift, 0, 26); SaveCheckpoint("7명 대피 완료 · 체크포인트 3. 돌진을 기둥으로 유도하세요.");
                }
            }
            if (s.stage == MissionStage.Boss && s.enemies.TrueForAll(e => e.hp == 0))
            { s.stage = MissionStage.Exit; Note("융합체 해체 완료. 북쪽 구조 차량에서 E로 귀환하세요."); }
        }
        void Hurt(int amount, Point source)
        {
            var s = State;
            if (s.dead || (s.dodge >= .13f && s.dodge <= .29f)) return;
            if (s.shield > 0 && Point.Dot((source - s.player).Normalized, s.facing) >= .6428f)
            { int blocked = Math.Min(s.shield, amount); s.shield -= blocked; amount -= blocked; }
            s.hp = Math.Max(0, s.hp - amount); s.channel = 0;
            if (s.hp == 0) s.dead = true;
            Emit("hurt", source, s.player);
        }
        void UpdateEnemy(EnemyState e, float dt)
        {
            var s = State;
            if (e.hp <= 0 || s.dead || s.stage == MissionStage.Reclaim) return;
            e.vulnerable = Math.Max(0, e.vulnerable - dt); e.timer -= dt;
            float distance = Point.Distance(e.position, s.player);
            if (e.kind == EnemyKind.Forklift)
            {
                int phase = e.hp <= e.maxHp * .25f ? 3 : e.hp <= e.maxHp * .6f ? 2 : 1;
                if (phase > e.phaseNumber) { e.phaseNumber = phase; e.phase = EnemyPhase.Recover; e.timer = 1.2f; e.vulnerable = 1.2f; return; }
            }
            if (e.phase == EnemyPhase.Approach)
            {
                if (distance > 15 || !Level.Visible(s, e.position, s.player)) return;
                float range = e.kind == EnemyKind.Artillery ? 10 : e.kind == EnemyKind.Forklift ? 12 : 5;
                if (distance > range)
                    e.position = Level.Move(s, e.position, (s.player - e.position).Normalized * dt * 2, e.kind == EnemyKind.Forklift ? 1 : .4f);
                else if (e.timer <= 0)
                {
                    e.phase = EnemyPhase.Telegraph; e.timer = e.kind == EnemyKind.Forklift ? 1.1f : e.kind == EnemyKind.Chaser ? .8f : .9f;
                    e.aim = e.kind == EnemyKind.Artillery || (e.kind == EnemyKind.Forklift && e.phaseNumber == 2) ? s.player : (s.player - e.position).Normalized;
                    e.hitPlayer = false;
                }
            }
            else if (e.phase == EnemyPhase.Telegraph && e.timer <= 0)
            {
                e.phase = EnemyPhase.Attack; e.timer = e.kind == EnemyKind.Forklift ? .8f : .45f;
                if (e.kind == EnemyKind.Artillery || (e.kind == EnemyKind.Forklift && e.phaseNumber == 2))
                {
                    if (Rules.Near(s.player, e.aim, 2.5f) && Level.Visible(s, e.position, e.aim)) Hurt(e.kind == EnemyKind.Artillery ? 24 : 32, e.position);
                    Emit("blast", e.aim, e.aim); e.hitPlayer = true;
                }
            }
            else if (e.phase == EnemyPhase.Attack)
            {
                bool charge = e.kind == EnemyKind.Chaser || (e.kind == EnemyKind.Forklift && e.phaseNumber != 2);
                if (charge)
                {
                    Point next = Level.Move(s, e.position, e.aim * dt * (e.kind == EnemyKind.Forklift ? 15 : 11));
                    if (e.kind == EnemyKind.Forklift && Point.Distance(next, e.position) < dt * 4)
                    {
                        bool broken = false;
                        if (!s.pillarA && Rules.Near(e.position, Level.PillarA, 2.4f)) { s.pillarA = true; broken = true; }
                        if (!s.pillarB && Rules.Near(e.position, Level.PillarB, 2.4f)) { s.pillarB = true; broken = true; }
                        if (broken) { e.vulnerable = 3; AddResidue(e.position, 12); Emit("break", e.position, e.position); }
                        e.phase = EnemyPhase.Recover; e.timer = broken ? 3 : 1.6f;
                    }
                    e.position = next;
                    if (!e.hitPlayer && Rules.Near(s.player, e.position, e.kind == EnemyKind.Forklift ? 1.8f : 1.1f) && Level.Visible(s, e.position, s.player))
                    { Hurt(e.kind == EnemyKind.Forklift ? 32 : 18, e.position); e.hitPlayer = true; }
                }
                if (e.timer <= 0) { e.phase = EnemyPhase.Recover; e.timer = e.kind == EnemyKind.Forklift ? 1.6f : 1.3f; }
            }
            else if (e.phase == EnemyPhase.Recover && e.timer <= 0)
            { e.phase = EnemyPhase.Approach; e.timer = .3f; }
        }
    }
}
