using System;
using System.IO;
using System.Text.Json;
using SLR.Domain;
using SLR.Tests;

class Program
{
    static int Main()
    {
        int passed = 0, failed = 0;
        foreach (var test in DomainChecks.Cases())
        {
            try { test.run(); Console.WriteLine("PASS " + test.name); passed++; }
            catch (Exception e) { Console.WriteLine("FAIL " + test.name + ": " + e.Message); failed++; }
        }
        var folder = Path.Combine(Path.GetTempPath(), "slr-check-" + Guid.NewGuid().ToString("N"));
        try
        {
            var options = new JsonSerializerOptions { IncludeFields = true, IgnoreReadOnlyProperties = true };
            var path = Path.Combine(folder, "checkpoint.slrsave");
            var store = new CheckpointStore(path, s => JsonSerializer.Serialize(s, options), json => JsonSerializer.Deserialize<WorldState>(json, options));
            var s = new Simulation().State; store.Write(s); s.energy = 63; store.Write(s);
            if (store.Read().energy != 63 || store.ReadBackup().energy != 30) throw new Exception("원자적 교체/백업 불일치");
            Console.WriteLine("PASS 저장 roundtrip 및 이전 버전 백업"); passed++;
            File.AppendAllText(path, "corrupted");
            bool rejected = false; try { store.Read(); } catch (InvalidDataException) { rejected = true; }
            if (!rejected || store.ReadBackup().energy != 30) throw new Exception("손상 감지/백업 실패");
            Console.WriteLine("PASS 손상된 저장 거절 및 백업 보존"); passed++;
        }
        catch (Exception e) { Console.WriteLine("FAIL 저장 테스트: " + e.Message); failed++; }
        finally { if (Directory.Exists(folder)) Directory.Delete(folder, true); }
        Console.WriteLine($"RESULT {passed} passed / {failed} failed");
        return failed == 0 ? 0 : 1;
    }
}
