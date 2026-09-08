using System;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

class SyntaxChecks
{
    static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : "Unity/Assets/SLR";
        int files = 0, failures = 0;
        foreach (string path in Directory.GetFiles(root, "*.cs", SearchOption.AllDirectories))
        {
            files++;
            var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(path), new CSharpParseOptions(LanguageVersion.CSharp9), path);
            foreach (var d in tree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error)) { Console.WriteLine(d); failures++; }
        }
        Console.WriteLine($"C# 9 syntax: {files} files / {failures} errors. This does not validate Unity API bindings.");
        return failures == 0 ? 0 : 1;
    }
}
