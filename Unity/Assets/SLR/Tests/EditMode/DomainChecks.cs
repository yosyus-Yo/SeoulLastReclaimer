using System;
using System.Collections.Generic;
using SLR.Domain;

namespace SLR.Tests
{
    // Same assertions run in Unity EditMode and the standalone .NET harness.
    public static class DomainChecks
    {
        static void Require(bool ok, string message) { if (!ok) throw new Exception(message); }
        static void Tick(Simulation sim, float seconds, PlayerInput input = default)
        { for (int i = 0; i < (int)Math.Ceiling(seconds * 60); i++) sim.Tick(1f / 60, input); }
        public static IEnumerable<(string name, Action run)> Cases()
        {
            yield return ("피해 내림과 방어력", () => {
                Require(Rules.Damage(20, 1, 20) == 16, "기본 16"); Require(Rules.Damage(20, 2, 20) == 33, "기술 33");
                Require(Rules.Damage(20, 1, 20, .5f) == 25, "보너스 25"); Require(Rules.Damage(0, 1, 500) == 1, "최소 피해"); });
            yield return ("부분 회수와 중복 회수", () => {
                var s = new WorldState { energy = 95 }; var r = new Residue { amount = 8 };
                Require(Simulation.Collect(s, r) == 5 && s.energy == 100 && r.amount == 3, "남은 3 보존");
                Require(Simulation.Collect(s, r) == 0 && r.amount == 3, "만충 시 보존");
                s.energy = 0; Require(Simulation.Collect(s, r) == 3 && Simulation.Collect(s, r) == 0, "단일 소비"); });
            yield return ("0.4초 채널 이후 회수", () => {
                var sim = new Simulation(); Tick(sim, .3f, new PlayerInput { reclaim = true }); Require(sim.State.energy == 30, "선회수 금지");
                Tick(sim, .15f, new PlayerInput { reclaim = true }); Require(sim.State.energy == 42, "회수 결과");
                Require(sim.State.stage == MissionStage.Warehouse, "첫 목표 전환"); });
            yield return ("벽 너머 회수 차단", () => {
                var sim = new Simulation(); sim.State.player = new Point(0, -7);
                sim.State.residues.Clear(); sim.State.residues.Add(new Residue { id = sim.State.nextId++, position = new Point(0, -3), amount = 8, life = 20 });
                Tick(sim, 1, new PlayerInput { reclaim = true }); Require(sim.State.energy == 30, "벽 관통 금지"); });
            yield return ("회피 벽 관통 차단", () => {
                var sim = new Simulation(); var p = Level.Move(sim.State, new Point(0, -7), new Point(0, 12));
                Require(p.z < -5.8f, "빠른 이동도 선반 앞 정지"); });
            yield return ("선반 견인과 재사용 차감 방지", () => {
                var sim = new Simulation(); sim.State.stage = MissionStage.Warehouse; sim.State.player = new Point(0, -7);
                sim.Tick(.016f, new PlayerInput { pull = true }); Require(sim.State.shelfMoved && sim.State.energy == 18, "첫 견인");
                sim.Tick(.016f, new PlayerInput { pull = true }); Require(sim.State.energy == 18, "쿨다운 중 소모 금지");
                Require(Level.Visible(sim.State, new Point(0, -7), new Point(0, -3)), "통로 개방"); });
            yield return ("기본 공격은 무료이며 죽은 적은 다시 드롭하지 않음", () => {
                var sim = new Simulation(); sim.State.enemies.Clear(); sim.State.stage = MissionStage.Warehouse;
                sim.State.player = new Point(0, -12); var e = sim.Spawn(EnemyKind.Chaser, 0, -10);
                e.hp = 20; Tick(sim, 2, new PlayerInput { attack = true, aim = new Point(0, 1) });
                Require(e.hp == 0 && sim.State.kills == 1 && sim.State.energy == 30, "처치 1회");
                Require(sim.State.residues.Count == 2, "시작 잔향과 처치 잔향 각 1개"); });
            yield return ("잔향 만료", () => {
                var sim = new Simulation(); sim.State.residues[0].life = .1f; Tick(sim, .2f); Require(sim.State.residues.Count == 0, "20초 수명 규칙"); });
            yield return ("두 지지점 설치가 대피 시작 조건", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Supports;
                s.shelfMoved = true; s.energy = 100; s.player = Level.SupportA;
                sim.Tick(.016f, new PlayerInput { shield = true }); Require(s.supportA && s.stage == MissionStage.Supports, "하나로 시작 금지");
                Tick(sim, 8.1f); s.player = Level.SupportB; sim.Tick(.016f, new PlayerInput { shield = true });
                Require(s.supportB && s.stage == MissionStage.Evacuation && s.energy == 60, "두 지지점과 비용"); });
            yield return ("20초 대피 및 보스 체크포인트", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Evacuation; s.supportA = s.supportB = s.shelfMoved = true;
                Tick(sim, 20.1f); Require(s.rescued == 7 && s.stage == MissionStage.Boss, "7명과 보스 단계");
                Require(sim.Checkpoint.rescued == 7 && s.enemies.Count == 1 && s.enemies[0].hp == 1400, "보스 생성/체크포인트"); });
            yield return ("방어 통로 위험도 실패", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Evacuation;
                s.danger = 99.99f; var e = sim.Spawn(EnemyKind.Chaser, 0, 6); e.phase = EnemyPhase.Recover; e.timer = 100;
                sim.Tick(.05f, default); Require(s.dead, "구조 방어 실패"); });
            yield return ("보스 처치만으로 임무 완료 금지", () => {
                var sim = new Simulation(); sim.State.enemies.Clear(); sim.State.stage = MissionStage.Boss; sim.State.rescued = 7;
                sim.Tick(.016f, default); Require(sim.State.stage == MissionStage.Exit, "출구 필요"); });
            yield return ("귀환 조건 및 보상 이벤트 중복 방지", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Exit;
                s.player = Level.Exit; int grants = 0; sim.MissionCompleted += id => grants++;
                sim.Tick(.016f, new PlayerInput { interact = true }); Require(grants == 0, "구조 미완료 거절");
                s.rescued = 7; sim.Tick(.016f, new PlayerInput { interact = true }); sim.Tick(.016f, new PlayerInput { interact = true });
                Require(grants == 1 && s.rewardCommitted && s.stage == MissionStage.Complete, "1회 완료");
                var resumed = new Simulation(sim.Checkpoint); resumed.MissionCompleted += id => grants++;
                resumed.Tick(.016f, new PlayerInput { interact = true }); Require(grants == 1, "재진입 중복 금지"); });
            yield return ("체크포인트는 깊은 복사", () => {
                var sim = new Simulation(); int hp = sim.State.enemies[0].hp;
                sim.State.enemies[0].hp = 0; sim.State.residues[0].amount = 0; sim.State.shelfMoved = true; sim.State.hp = 0;
                sim.Retry(); Require(sim.State.enemies[0].hp == hp && sim.State.residues[0].amount == 12 && !sim.State.shelfMoved && sim.State.hp == 120, "전체 복원"); });
            yield return ("보스 견인 면역", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Boss; s.player = new Point(0, 20);
                var e = sim.Spawn(EnemyKind.Forklift, 0, 25); e.phase = EnemyPhase.Recover; e.timer = 3;
                sim.Tick(.016f, new PlayerInput { pull = true, aim = new Point(0, 1) }); Require(e.position.z == 25 && e.hp < 1400, "끌리지 않고 피해만"); });
            yield return ("적 공격 예고와 단일 타격", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Warehouse; s.player = new Point(0, -12);
                var e = sim.Spawn(EnemyKind.Chaser, 0, -10); e.timer = 0;
                sim.Tick(.016f, default); Require(e.phase == EnemyPhase.Telegraph && s.hp == 120, "첫 예고");
                Tick(sim, .6f); Require(s.hp == 120, "예고 중 피해 없음");
                Tick(sim, .6f); Require(s.hp == 102, "한 돌진 한번 피해"); });
            yield return ("정면 방벽의 초과 피해만 체력 전달", () => {
                var sim = new Simulation(); var s = sim.State; s.enemies.Clear(); s.stage = MissionStage.Warehouse;
                s.player = new Point(0, -12); s.facing = new Point(0, 1); s.shield = 10; s.shieldTime = 3;
                var e = sim.Spawn(EnemyKind.Artillery, 0, -10); e.phase = EnemyPhase.Telegraph; e.timer = 0; e.aim = s.player;
                sim.Tick(.016f, default); Require(s.hp == 106 && s.shield == 0, "24 - 10 = 14"); });
            yield return ("사망 상태 입력 무시", () => {
                var sim = new Simulation(); sim.State.dead = true; var p = sim.State.player;
                Tick(sim, 1, new PlayerInput { move = new Point(1, 0), attack = true, reclaim = true, shield = true });
                Require(sim.State.player.x == p.x && sim.State.energy == 30, "사망 후 조작 금지"); });
            yield return ("안전한 시작 상태 유효성", () => CheckpointStore.Validate(new Simulation().State));
            yield return ("지원하지 않는 저장 버전 거절", () => {
                var s = new Simulation().State; s.schemaVersion = 100;
                bool rejected = false; try { CheckpointStore.Validate(s); } catch (System.IO.InvalidDataException) { rejected = true; }
                Require(rejected, "미래 버전 거절"); });
        }
    }
}
