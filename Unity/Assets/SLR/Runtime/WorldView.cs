using System.Collections.Generic;
using SLR.Domain;
using UnityEngine;
using UnityEngine.Rendering;

namespace SLR.Runtime
{
    // Deliberately procedural blockout: no concept sheet is presented as a finished 3D model.
    public sealed class WorldView : MonoBehaviour
    {
        public Camera GameCamera { get; private set; }
        public static readonly Color Cyan = new Color(.56f, .91f, .95f), Orange = new Color(.94f, .52f, .33f);
        readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        readonly Dictionary<string, Transform> objects = new Dictionary<string, Transform>();
        readonly HashSet<string> alive = new HashSet<string>();
        readonly List<string> removed = new List<string>();
        readonly List<Effect> effects = new List<Effect>();
        Transform world, player, shield;
        MissionController controller;
        AudioSource audioSource;
        AudioClip collectSound, hitSound;
        struct Effect { public GameObject obj; public float until; }

        public static Vector3 V(Point p, float y = 0) => new Vector3(p.x, y, p.z);
        public void Initialize(MissionController owner)
        {
            controller = owner;
            GameCamera = new GameObject("Quarter-view camera").AddComponent<Camera>();
            GameCamera.tag = "MainCamera"; GameCamera.orthographic = true; GameCamera.orthographicSize = 11;
            GameCamera.nearClipPlane = .1f; GameCamera.farClipPlane = 150;
            GameCamera.clearFlags = CameraClearFlags.SolidColor; GameCamera.backgroundColor = new Color(.055f, .09f, .12f);
            GameCamera.transform.rotation = Quaternion.Euler(35, 45, 0);
            GameCamera.gameObject.AddComponent<AudioListener>();
            var light = new GameObject("Dawn key light").AddComponent<Light>(); light.type = LightType.Directional;
            light.transform.rotation = Quaternion.Euler(50, -30, 0); light.color = new Color(.77f, .86f, 1); light.intensity = 1.6f;
            light.shadows = LightShadows.Soft;
            RenderSettings.ambientMode = AmbientMode.Flat; RenderSettings.ambientLight = new Color(.35f, .43f, .51f);
            RenderSettings.fog = false;
            audioSource = gameObject.AddComponent<AudioSource>(); audioSource.spatialBlend = 0; audioSource.volume = .17f;
            collectSound = Tone("Reclaim placeholder", 650, .2f, true); hitSound = Tone("Impact placeholder", 140, .08f, false);
        }
        Material Mat(Color color, bool glow = false)
        {
            string key = ColorUtility.ToHtmlStringRGBA(color) + glow;
            if (materials.TryGetValue(key, out var cached)) return cached;
            var template = Resources.Load<Material>("SLR_Default");
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var material = template != null ? new Material(template) : new Material(shader);
            material.color = color;
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", .35f);
            if (glow) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color * 1.4f); }
            materials.Add(key, material); return material;
        }
        Transform Shape(string name, PrimitiveType type, Vector3 position, Vector3 scale, Color color, Transform parent, bool glow = false)
        {
            var obj = GameObject.CreatePrimitive(type); obj.name = name; obj.transform.SetParent(parent, false);
            obj.transform.localPosition = position; obj.transform.localScale = scale;
            var collider = obj.GetComponent<Collider>(); if (collider != null) { collider.enabled = false; Destroy(collider); }
            obj.GetComponent<Renderer>().sharedMaterial = Mat(color, glow);
            return obj.transform;
        }
        Transform Box(string name, Vector3 p, Vector3 size, Color color, Transform parent, bool glow = false) => Shape(name, PrimitiveType.Cube, p, size, color, parent, glow);
        public void Rebuild(WorldState state)
        {
            if (world != null) { world.gameObject.SetActive(false); Destroy(world.gameObject); }
            foreach (var e in effects) if (e.obj != null) Destroy(e.obj);
            effects.Clear(); objects.Clear(); world = new GameObject("M001 · Guro Logistics Blockout").transform;
            Box("Asphalt", new Vector3(0, -.18f, 10), new Vector3(37, .3f, 55), new Color(.18f, .23f, .27f), world);
            Box("Warehouse concrete", new Vector3(0, -.005f, 2.3f), new Vector3(35, .02f, 14), new Color(.35f, .39f, .42f), world);
            for (int z = -15; z < 36; z += 4)
                Box("Lane marking", new Vector3(0, .025f, z), new Vector3(.13f, .02f, 1.5f), new Color(.8f, .7f, .48f), world);
            foreach (var o in Level.Static) AddObstacle(o, world);
            // Buildings are outside the playable perimeter, with their low cutaway walls facing the camera.
            for (int i = 0; i < 5; i++)
            {
                float z = -12 + i * 10;
                Box("Industrial block", new Vector3(-22, 4, z), new Vector3(7, 8, 8), new Color(.28f, .34f, .39f), world);
                Box("Roller shutter", new Vector3(-18.45f, 1.6f, z), new Vector3(.12f, 3.2f, 4), new Color(.16f, .21f, .24f), world);
                for (int j = 0; j < 4; j++)
                    Box("Lit window", new Vector3(-18.45f, 5.5f, z - 2.5f + j * 1.5f), new Vector3(.1f, 1.2f, .8f), new Color(.9f, .79f, .51f), world, true);
                for (int j = 0; j < 3; j++)
                    Box("Shipment", new Vector3(15 + (j % 2), .4f + (j == 2 ? .8f : 0), z), new Vector3(.8f, .8f, .8f), new Color(.43f, .3f, .2f), world);
            }
            foreach (float x in new[] { -16f, 16f })
                for (int z = -12; z < 35; z += 10)
                {
                    Box("Safety bollard", new Vector3(x, .5f, z), new Vector3(.25f, 1, .25f), Orange, world);
                    Box("Reflector", new Vector3(x, .8f, z), new Vector3(.3f, .15f, .3f), Color.white, world);
                }
            var truck = new GameObject("Rescue vehicle").transform; truck.SetParent(world); truck.position = new Vector3(0, 0, 35);
            Box("Body", new Vector3(0, 1, 0), new Vector3(2.7f, 1.8f, 3.5f), new Color(.8f, .82f, .78f), truck);
            Box("Emergency stripe", new Vector3(0, 1.4f, -1.8f), new Vector3(2.7f, .25f, .1f), Orange, truck);
            Box("Emergency beacon", new Vector3(0, 2, 0), new Vector3(1.5f, .2f, .5f), Cyan, truck, true);
            player = Human("TK01 · 윤태경", new Color(.24f, .29f, .33f)); player.SetParent(world);
            shield = new GameObject("Layered shield").transform; shield.SetParent(player, false);
            for (int i = 0; i < 3; i++) Box("Shield layer", new Vector3(0, 1, 1 + i * .14f), new Vector3(1.8f - i * .15f, .06f, .07f), Cyan, shield, true);
            for (int i = 0; i < 7; i++)
            {
                var npc = Human("Worker " + (i + 1), new Color(.48f, .39f, .27f)); npc.SetParent(world);
                objects.Add("npc-" + i, npc);
            }
            Sync(state);
            GameCamera.transform.position = V(state.player, .5f) - GameCamera.transform.forward * 32;
        }
        Transform Human(string name, Color coat)
        {
            var root = new GameObject(name).transform;
            Box("Jacket", new Vector3(0, 1.05f, 0), new Vector3(.65f, .8f, .4f), coat, root);
            Shape("Helmet", PrimitiveType.Sphere, new Vector3(0, 1.65f, 0), new Vector3(.43f, .4f, .43f), Orange, root);
            Box("Face", new Vector3(0, 1.5f, .23f), new Vector3(.27f, .2f, .1f), new Color(.73f, .57f, .45f), root);
            Box("Left boot", new Vector3(-.2f, .3f, .05f), new Vector3(.25f, .6f, .38f), new Color(.1f, .13f, .15f), root);
            Box("Right boot", new Vector3(.2f, .3f, .05f), new Vector3(.25f, .6f, .38f), new Color(.1f, .13f, .15f), root);
            Box("Reflective harness", new Vector3(0, 1.15f, .23f), new Vector3(.7f, .1f, .06f), new Color(.96f, .83f, .5f), root);
            Box("Reclaimer gauntlet", new Vector3(-.48f, 1, .1f), new Vector3(.3f, .45f, .45f), Cyan, root, true);
            return root;
        }
        void AddObstacle(Obstacle o, Transform parent)
        {
            var color = o.id.Contains("rack") ? new Color(.43f, .35f, .25f) : new Color(.34f, .4f, .44f);
            var t = Box(o.id, new Vector3(o.x, o.height / 2, o.z), new Vector3(o.width, o.height, o.depth), color, parent);
            if (o.id.Contains("rack"))
                Box("Safety tape", new Vector3(0, .2f, -.51f), new Vector3(.95f, .07f, .03f), Orange, t);
        }
        Transform Dynamic(string key, System.Func<Transform> create)
        {
            alive.Add(key);
            if (!objects.TryGetValue(key, out var t)) { t = create(); t.SetParent(world, true); objects.Add(key, t); }
            return t;
        }
        Transform Marker(string name, Point p, Color color, float radius = 1)
        {
            var t = Shape(name, PrimitiveType.Cylinder, V(p, .06f), new Vector3(radius * 2, .025f, radius * 2), color, world, true);
            return t;
        }
        public void Sync(WorldState s)
        {
            alive.Clear(); player.position = V(s.player);
            player.rotation = Quaternion.LookRotation(V(s.facing));
            shield.gameObject.SetActive(s.shield > 0);
            foreach (var e in s.enemies)
            {
                if (e.hp <= 0) continue;
                var t = Dynamic("enemy-" + e.id, () => EnemyModel(e.kind));
                t.position = V(e.position); var look = e.phase == EnemyPhase.Telegraph && e.kind != EnemyKind.Artillery ? e.aim : s.player - e.position;
                if (look.Length > .01f) t.rotation = Quaternion.LookRotation(V(look));
                if (e.phase == EnemyPhase.Telegraph)
                {
                    bool circle = e.kind == EnemyKind.Artillery || (e.kind == EnemyKind.Forklift && e.phaseNumber == 2);
                    var warning = Dynamic("warning-" + e.id, () => circle ? Marker("Impact warning", e.aim, Orange, 2.5f) : Box("Charge warning", Vector3.zero, Vector3.one, Orange, world, true));
                    if (circle) warning.position = V(e.aim, .05f);
                    else
                    {
                        float length = e.kind == EnemyKind.Forklift ? 12 : 5;
                        warning.position = V(e.position + e.aim * (length / 2), .05f);
                        warning.rotation = Quaternion.LookRotation(V(e.aim)); warning.localScale = new Vector3(e.kind == EnemyKind.Forklift ? 2.3f : 1.2f, .035f, length);
                    }
                }
            }
            foreach (var r in s.residues)
            {
                var t = Dynamic("residue-" + r.id, () => Shape("잔향", PrimitiveType.Cube, Vector3.zero, Vector3.one * .35f, Cyan, world, true));
                t.position = V(r.position, .5f + Mathf.Sin(s.time * 3 + r.id) * .13f); t.rotation = Quaternion.Euler(45, s.time * 70, 45);
            }
            if (!s.shelfMoved) Dynamic("shelf", () => Box("견인 선반", V(Level.Shelf, .8f), new Vector3(7, 1.6f, 1), Orange, world));
            if (s.stage < MissionStage.Boss) Dynamic("gate", () => Box("대피 통제선", new Vector3(0, .7f, 10), new Vector3(7, 1.4f, .3f), new Color(.53f, .38f, .26f), world));
            if (!s.pillarA) Dynamic("pillar-a", () => Box("노후 기둥 A", V(Level.PillarA, 1.5f), new Vector3(1.2f, 3, 1.2f), new Color(.54f, .55f, .52f), world));
            if (!s.pillarB) Dynamic("pillar-b", () => Box("노후 기둥 B", V(Level.PillarB, 1.5f), new Vector3(1.2f, 3, 1.2f), new Color(.54f, .55f, .52f), world));
            if (s.stage >= MissionStage.Supports && s.stage <= MissionStage.Evacuation)
            {
                Dynamic("support-a-" + s.supportA, () => Marker("지지점 A", Level.SupportA, s.supportA ? Cyan : new Color(.9f, .8f, .6f)));
                Dynamic("support-b-" + s.supportB, () => Marker("지지점 B", Level.SupportB, s.supportB ? Cyan : new Color(.9f, .8f, .6f)));
                if (!s.batteryTaken) Dynamic("battery", () => Box("비상 배터리", V(Level.Battery, .5f), Vector3.one, Cyan, world));
            }
            for (int i = 0; i < 7; i++)
            {
                string key = "npc-" + i; alive.Add(key);
                if (objects.TryGetValue(key, out var npc))
                {
                    npc.gameObject.SetActive(s.stage >= MissionStage.Supports);
                    npc.position = i < s.rescued ? new Vector3(-4 + i * 1.2f, 0, 33) : new Vector3(-1.5f + (i % 3) * 1.5f, 0, 7 + (i / 3) * .9f);
                }
            }
            if (s.stage == MissionStage.Exit) Dynamic("exit", () => Marker("귀환", Level.Exit, Cyan, 2));
            removed.Clear(); foreach (var entry in objects) if (!alive.Contains(entry.Key)) removed.Add(entry.Key);
            foreach (string key in removed) { Destroy(objects[key].gameObject); objects.Remove(key); }
            if (!controller.Paused)
            {
                var target = V(s.player, .5f) - GameCamera.transform.forward * 32;
                GameCamera.transform.position = Vector3.Lerp(GameCamera.transform.position, target, 1 - Mathf.Exp(-7 * Time.unscaledDeltaTime));
                GameCamera.orthographicSize = Mathf.Lerp(GameCamera.orthographicSize, s.stage == MissionStage.Boss ? 12 : 10, .05f);
            }
            for (int i = effects.Count - 1; i >= 0; i--)
                if (Time.unscaledTime >= effects[i].until) { Destroy(effects[i].obj); effects.RemoveAt(i); }
        }
        Transform EnemyModel(EnemyKind kind)
        {
            var t = new GameObject(kind.ToString()).transform;
            if (kind == EnemyKind.Forklift)
            {
                Box("Forklift chassis", new Vector3(0, .65f, 0), new Vector3(2.2f, 1.2f, 3), Orange, t);
                Box("Mast", new Vector3(0, 1.8f, 1), new Vector3(1.8f, 3, .25f), new Color(.22f, .28f, .3f), t);
                foreach (float x in new[] { -.8f, .8f }) Box("Fork", new Vector3(x, .25f, 2), new Vector3(.22f, .25f, 2.5f), new Color(.5f, .55f, .6f), t);
                Shape("Anchor core", PrimitiveType.Sphere, new Vector3(0, 1.8f, -.3f), Vector3.one * 1.7f, new Color(.53f, .38f, .7f), t, true);
            }
            else
            {
                Shape("Distorted core", kind == EnemyKind.Chaser ? PrimitiveType.Cube : PrimitiveType.Sphere, new Vector3(0, .6f, 0), Vector3.one * .9f, new Color(.38f, .3f, .48f), t);
                Box("Danger face", new Vector3(0, .7f, .5f), new Vector3(.5f, .13f, .1f), Orange, t, true);
                for (int i = 0; i < 4; i++) Box("Scrap leg", new Vector3((i % 2 == 0 ? -1 : 1) * .55f, .25f, (i < 2 ? -1 : 1) * .35f), new Vector3(.15f, .5f, .18f), new Color(.15f, .2f, .24f), t);
            }
            return t;
        }
        public void PlayEvents(List<WorldEvent> events, bool sound, bool lowEffects)
        {
            foreach (var e in events)
            {
                if (e.kind == "note") continue;
                if (effects.Count < (lowEffects ? 24 : 64))
                {
                    Color color = e.kind == "hurt" || e.kind == "blast" ? Orange : Cyan;
                    var delta = V(e.to, 1) - V(e.from, 1); float length = delta.magnitude;
                    var t = Box(e.kind, (V(e.from, 1) + V(e.to, 1)) / 2, new Vector3(.07f, .07f, Mathf.Max(.2f, length)), color, world, true);
                    if (length > .01f) t.rotation = Quaternion.LookRotation(delta);
                    effects.Add(new Effect { obj = t.gameObject, until = Time.unscaledTime + .18f });
                }
                if (sound && (e.kind == "reclaim" || e.kind == "hit")) audioSource.PlayOneShot(e.kind == "reclaim" ? collectSound : hitSound);
            }
        }
        static AudioClip Tone(string name, float frequency, float seconds, bool rise)
        {
            int length = Mathf.CeilToInt(22050 * seconds); float[] samples = new float[length];
            for (int i = 0; i < length; i++)
            { float t = (float)i / 22050; samples[i] = Mathf.Sin(2 * Mathf.PI * frequency * t * (rise ? 1 + t * 2 : 1)) * (1 - (float)i / length) * .4f; }
            var clip = AudioClip.Create(name, length, 1, 22050, false); clip.SetData(samples, 0); return clip;
        }
        void OnDestroy()
        {
            foreach (var m in materials.Values) Destroy(m);
            if (collectSound != null) Destroy(collectSound); if (hitSound != null) Destroy(hitSound);
        }
    }
}
