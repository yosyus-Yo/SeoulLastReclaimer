using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace SLR.Domain
{
    // Serializer is injected: JsonUtility in Unity, System.Text.Json in the standalone checks.
    public sealed class CheckpointStore
    {
        readonly string path;
        readonly Func<WorldState, string> serialize;
        readonly Func<string, WorldState> deserialize;
        public CheckpointStore(string path, Func<WorldState, string> serialize, Func<string, WorldState> deserialize)
        { this.path = path; this.serialize = serialize; this.deserialize = deserialize; }
        static string Hash(string text)
        {
            using (var sha = SHA256.Create()) return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(text)));
        }
        public void Write(WorldState state)
        {
            Validate(state);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string json = serialize(state), temporary = path + ".tmp";
            File.WriteAllText(temporary, Hash(json) + "\n" + json, new UTF8Encoding(false));
            ReadFile(temporary);
            if (File.Exists(path)) File.Replace(temporary, path, path + ".backup");
            else File.Move(temporary, path);
        }
        WorldState ReadFile(string file)
        {
            string text = File.ReadAllText(file); int newline = text.IndexOf('\n');
            if (newline < 0) throw new InvalidDataException("체크섬 누락");
            string json = text.Substring(newline + 1);
            if (text.Substring(0, newline) != Hash(json)) throw new InvalidDataException("저장 체크섬 불일치");
            var state = deserialize(json); Validate(state); return state;
        }
        public WorldState Read() => File.Exists(path) ? ReadFile(path) : null;
        public WorldState ReadBackup() => File.Exists(path + ".backup") ? ReadFile(path + ".backup") : null;
        public bool Exists => File.Exists(path);
        public bool HasBackup => File.Exists(path + ".backup");
        static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        public static void Validate(WorldState s)
        {
            if (s == null || s.schemaVersion != 1 || s.contentVersion != "M001-prototype-0.1") throw new InvalidDataException("지원하지 않는 저장 버전");
            if (string.IsNullOrWhiteSpace(s.instanceId) || s.enemies == null || s.residues == null || s.enemies.Count > 32 || s.residues.Count > 128)
                throw new InvalidDataException("저장 구조 오류");
            if (s.hp < 0 || s.hp > 120 || s.energy < 0 || s.energy > 100 || !Finite(s.stamina) || s.stamina < 0 || s.stamina > 100 || !Enum.IsDefined(typeof(MissionStage), s.stage))
                throw new InvalidDataException("플레이어 값 오류");
            if (!Finite(s.player.x) || !Finite(s.player.z) || !Level.Free(s, s.player) || s.rescued < 0 || s.rescued > 7)
                throw new InvalidDataException("임무 위치 오류");
            if (s.stage == MissionStage.Complete && (s.rescued != 7 || !s.rewardCommitted)) throw new InvalidDataException("완료 조건 오류");
            var ids = new System.Collections.Generic.HashSet<int>();
            foreach (var e in s.enemies)
                if (!ids.Add(e.id) || e.id <= 0 || e.id >= s.nextId || e.hp < 0 || e.hp > e.maxHp || !Finite(e.position.x) || !Finite(e.position.z))
                    throw new InvalidDataException("적 데이터 오류");
            foreach (var r in s.residues)
                if (!ids.Add(r.id) || r.id <= 0 || r.id >= s.nextId || r.amount < 0 || !Finite(r.life) || !Finite(r.position.x) || !Finite(r.position.z))
                    throw new InvalidDataException("잔향 데이터 오류");
        }
    }
}
