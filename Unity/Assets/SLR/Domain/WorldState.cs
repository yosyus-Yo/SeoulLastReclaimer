using System;
using System.Collections.Generic;

namespace SLR.Domain
{
    [Serializable]
    public struct Point
    {
        public float x, z;
        public Point(float x, float z) { this.x = x; this.z = z; }
        public float Length => (float)Math.Sqrt(x * x + z * z);
        public Point Normalized => Length > .0001f ? this / Length : new Point(0, 1);
        public static Point operator +(Point a, Point b) => new Point(a.x + b.x, a.z + b.z);
        public static Point operator -(Point a, Point b) => new Point(a.x - b.x, a.z - b.z);
        public static Point operator *(Point a, float n) => new Point(a.x * n, a.z * n);
        public static Point operator /(Point a, float n) => new Point(a.x / n, a.z / n);
        public static float Distance(Point a, Point b) => (a - b).Length;
        public static float Dot(Point a, Point b) => a.x * b.x + a.z * b.z;
    }

    public static class Rules
    {
        public const int MaxHp = 120, MaxEnergy = 100;
        public const float Speed = 5.2f, ReclaimRange = 6, ReclaimChannel = .4f;
        public static int Damage(int attack, float coefficient, int armor, float bonus = 0) =>
            Math.Max(1, (int)Math.Floor(attack * coefficient * (1 + Math.Min(1, Math.Max(0, bonus))) * 100 / (100 + Math.Max(0, armor))));
        public static float Clamp(float v, float min, float max) => Math.Max(min, Math.Min(max, v));
        public static bool Near(Point a, Point b, float range) => Point.Distance(a, b) <= range;
    }

    public enum MissionStage { Reclaim, Warehouse, Supports, Evacuation, Boss, Exit, Complete }
    public enum EnemyKind { Chaser, Artillery, Forklift }
    public enum EnemyPhase { Approach, Telegraph, Attack, Recover, Dead }

    [Serializable]
    public sealed class EnemyState
    {
        public int id, hp, maxHp, armor, phaseNumber = 1;
        public EnemyKind kind;
        public EnemyPhase phase;
        public Point position, aim;
        public float timer, vulnerable;
        public bool hitPlayer;
        public EnemyState Clone() => (EnemyState)MemberwiseClone();
    }

    [Serializable]
    public sealed class Residue
    {
        public int id, amount;
        public Point position;
        public float life;
        public Residue Clone() => (Residue)MemberwiseClone();
    }

    [Serializable]
    public sealed class WorldState
    {
        public int schemaVersion = 1;
        public string contentVersion = "M001-prototype-0.1";
        public string instanceId = Guid.NewGuid().ToString("N");
        public Point player = new Point(-12, -13), facing = new Point(0, 1), dodgeDirection;
        public int hp = Rules.MaxHp, energy = 30, shield, rescued, kills, collected, nextId = 1;
        public float stamina = 100, staminaDelay, dodge, attackCooldown, shieldCooldown, pullCooldown;
        public float shieldTime, channel, time, evacuation, danger;
        public bool dead, shelfMoved, supportA, supportB, batteryTaken, pillarA, pillarB;
        public bool rewardCommitted;
        public MissionStage stage;
        public List<EnemyState> enemies = new List<EnemyState>();
        public List<Residue> residues = new List<Residue>();

        public WorldState Clone()
        {
            var copy = (WorldState)MemberwiseClone();
            copy.enemies = enemies.ConvertAll(e => e.Clone());
            copy.residues = residues.ConvertAll(e => e.Clone());
            return copy;
        }
    }

    public struct PlayerInput
    {
        public Point move, aim;
        public bool attack, reclaim, dodge, shield, pull, interact;
    }

    public readonly struct WorldEvent
    {
        public readonly string kind, message;
        public readonly Point from, to;
        public WorldEvent(string kind, Point from, Point to, string message = "")
        { this.kind = kind; this.from = from; this.to = to; this.message = message; }
    }

    public readonly struct Obstacle
    {
        public readonly string id;
        public readonly float x, z, width, depth, height;
        public Obstacle(string id, float x, float z, float width, float depth, float height)
        { this.id = id; this.x = x; this.z = z; this.width = width; this.depth = depth; this.height = height; }
        public bool Contains(Point p, float margin) => Math.Abs(p.x - x) < width / 2 + margin && Math.Abs(p.z - z) < depth / 2 + margin;
    }

    public static class Level
    {
        public static readonly Point Shelf = new Point(0, -5), SupportA = new Point(-2.5f, 5.5f), SupportB = new Point(2.5f, 5.5f);
        public static readonly Point Battery = new Point(-4, 1), Exit = new Point(0, 34);
        public static readonly Point PillarA = new Point(-6, 23), PillarB = new Point(6, 23);
        public static readonly Obstacle[] Static = {
            new Obstacle("west", -18, 10, 1, 54, 2), new Obstacle("east", 18, 10, 1, 54, 2),
            new Obstacle("south", 0, -17, 37, 1, 2), new Obstacle("north", 0, 37, 37, 1, 2),
            new Obstacle("warehouse-left", -10.5f, -5, 14, 1, 2), new Obstacle("warehouse-right", 10.5f, -5, 14, 1, 2),
            new Obstacle("passage-left", -10.5f, 10, 14, 1, 2), new Obstacle("passage-right", 10.5f, 10, 14, 1, 2),
            new Obstacle("rack-1", -10, 0, 3, 4, 2.2f), new Obstacle("rack-2", 10, 0, 3, 4, 2.2f),
            new Obstacle("crate-1", -12, 17, 3, 3, 1.2f), new Obstacle("crate-2", 12, 29, 3, 3, 1.2f)
        };
        public static IEnumerable<Obstacle> Obstacles(WorldState s)
        {
            foreach (var o in Static) yield return o;
            if (!s.shelfMoved) yield return new Obstacle("shelf", 0, -5, 7, 1, 1.6f);
            if (s.stage < MissionStage.Boss) yield return new Obstacle("gate", 0, 10, 7, 1, 1.4f);
            if (!s.pillarA) yield return new Obstacle("pillar-a", -6, 23, 1.2f, 1.2f, 3);
            if (!s.pillarB) yield return new Obstacle("pillar-b", 6, 23, 1.2f, 1.2f, 3);
        }
        public static bool Free(WorldState s, Point p, float radius = .35f)
        {
            foreach (var o in Obstacles(s)) if (o.Contains(p, radius)) return false;
            return true;
        }
        public static bool Visible(WorldState s, Point a, Point b)
        {
            int steps = Math.Max(1, (int)Math.Ceiling(Point.Distance(a, b) / .2f));
            for (int i = 1; i < steps; i++) if (!Free(s, a + (b - a) * ((float)i / steps), 0)) return false;
            return true;
        }
        public static Point Move(WorldState s, Point p, Point delta, float radius = .35f)
        {
            int steps = Math.Max(1, (int)Math.Ceiling(delta.Length / .15f));
            delta /= steps;
            for (int i = 0; i < steps; i++)
            {
                var next = new Point(p.x + delta.x, p.z);
                if (Free(s, next, radius)) p = next;
                next = new Point(p.x, p.z + delta.z);
                if (Free(s, next, radius)) p = next;
            }
            return p;
        }
    }
}
