using System.IO;
using SLR.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace SLR.Editor
{
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        const string ScenePath = "Assets/SLR/Scenes/Bootstrap.unity";
        const string PipelinePath = "Assets/SLR/Settings/SLR_URP.asset";
        static ProjectSetup() { EditorApplication.delayCall += FirstImport; }
        static void FirstImport()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling || AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath) != null) return;
            Configure();
            if (!UnityEngine.SceneManagement.SceneManager.GetActiveScene().isDirty) EditorSceneManager.OpenScene(ScenePath);
        }
        [MenuItem("SLR/Configure project")]
        public static void Configure()
        {
            Directory.CreateDirectory("Assets/SLR/Settings");
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, "Assets/SLR/Settings/SLR_Renderer.asset");
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                pipeline.name = "SLR URP"; pipeline.supportsHDR = true; pipeline.msaaSampleCount = 2;
                pipeline.shadowDistance = 45;
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
            }
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            Directory.CreateDirectory("Assets/SLR/Resources");
            if (AssetDatabase.LoadAssetAtPath<Material>("Assets/SLR/Resources/SLR_Default.mat") == null)
            {
                var material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(material, "Assets/SLR/Resources/SLR_Default.mat");
            }
            PlayerSettings.companyName = "SeoulLastReclaimer";
            PlayerSettings.productName = "서울의 마지막 회수자";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.defaultScreenWidth = 1600; PlayerSettings.defaultScreenHeight = 900;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.runInBackground = false;
            // Direct keyboard API intentionally needs legacy input for this first blockout.
            var settingsAssets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (settingsAssets.Length > 0)
            {
                var settings = new SerializedObject(settingsAssets[0]);
                var activeInput = settings.FindProperty("activeInputHandler");
                if (activeInput != null && activeInput.intValue != 0) { activeInput.intValue = 0; settings.ApplyModifiedPropertiesWithoutUndo(); }
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("SLR configured. Open Assets/SLR/Scenes/Bootstrap.unity and press Play.");
        }
        [MenuItem("SLR/Open first mission")]
        public static void OpenMission()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            EditorSceneManager.OpenScene(ScenePath);
        }
        [MenuItem("SLR/Build macOS prototype")]
        public static void BuildMac() => Build(BuildTarget.StandaloneOSX, "Builds/macOS/SeoulLastReclaimer.app");
        [MenuItem("SLR/Build Windows prototype")]
        public static void BuildWindows() => Build(BuildTarget.StandaloneWindows64, "Builds/Windows/SeoulLastReclaimer.exe");
        static void Build(BuildTarget target, string path)
        {
            Configure();
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, target)) throw new System.InvalidOperationException("Install the corresponding Unity build-support module first.");
            var report = BuildPipeline.BuildPlayer(new[] { ScenePath }, path, target, BuildOptions.Development);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) throw new System.InvalidOperationException("Build failed. See Unity build report.");
        }
    }
}
