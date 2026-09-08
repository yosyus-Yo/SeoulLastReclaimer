using System;
using System.IO;
using SLR.Domain;
using UnityEngine;

namespace SLR.Runtime
{
    public sealed class MissionController : MonoBehaviour
    {
        public Simulation Simulation { get; private set; }
        public bool Started { get; private set; }
        public bool Paused { get; private set; }
        public string Notice { get; private set; } = "들어가는 사람의 숫자부터 세. 나올 때 그 숫자 맞추는 게 일이야.";
        public string SaveError { get; private set; } = "";
        public bool CanContinue => store != null && store.Exists;
        public bool HasBackup => store != null && store.HasBackup;
        public bool SoundEnabled = true;
        public bool LowEffects = true;
        WorldView view;
        CheckpointStore store;
        float accumulator, noticeTime;
        PlayerInput input;

        void Awake()
        {
            Application.targetFrameRate = 60;
            store = new CheckpointStore(Path.Combine(Application.persistentDataPath, "M001", "current.slrsave"),
                s => JsonUtility.ToJson(s), json => JsonUtility.FromJson<WorldState>(json));
            view = gameObject.AddComponent<WorldView>();
            view.Initialize(this);
            gameObject.AddComponent<MissionHud>().Initialize(this, view);
            Bind(new Simulation());
        }
        void Bind(Simulation simulation)
        {
            Simulation = simulation;
            Simulation.CheckpointReached += Save;
            view.Rebuild(Simulation.State);
            accumulator = 0; input = default;
        }
        void Save(WorldState state)
        {
            try { store.Write(state); SaveError = ""; }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException)
            { SaveError = "저장하지 못했습니다. 저장 공간을 확인한 뒤 ‘저장 재시도’를 누르세요."; Debug.LogWarning(e.Message); }
        }
        public void RetrySave() => Save(Simulation.Checkpoint);
        public void Begin(bool resume)
        {
            try
            {
                WorldState saved = resume ? store.Read() : null;
                Bind(new Simulation(saved)); Started = true; Paused = false; SaveError = "";
                if (!resume) Save(Simulation.Checkpoint);
                Tell("우클릭으로 청백색 잔향을 회수하세요. WASD 이동 · 마우스 조준");
            }
            catch (Exception e) when (e is IOException || e is ArgumentException || e is UnauthorizedAccessException)
            { SaveError = "저장 파일을 읽을 수 없습니다. 백업 복원 또는 새 출동을 선택하세요."; Debug.LogWarning(e.Message); }
        }
        public void RestoreBackup()
        {
            try
            {
                var backup = store.ReadBackup(); if (backup == null) return;
                Bind(new Simulation(backup)); Started = true; Paused = false; SaveError = "";
                Tell("이전 체크포인트 백업을 불러왔습니다.");
            }
            catch (Exception e) when (e is IOException || e is ArgumentException || e is UnauthorizedAccessException)
            { SaveError = "백업 파일도 읽을 수 없습니다. 파일을 보존하고 새 출동을 선택할 수 있습니다."; Debug.LogWarning(e.Message); }
        }
        public void Retry()
        {
            Simulation.Retry(); view.Rebuild(Simulation.State); Paused = false;
            accumulator = 0; input = default; Tell("체크포인트 복원 완료.");
        }
        public void TogglePause() { Paused = !Paused; input = default; accumulator = 0; }
        public void Title() { Started = false; Paused = false; input = default; accumulator = 0; }
        public void Tell(string text) { Notice = text; noticeTime = 7; }
        void OnApplicationFocus(bool focus) { if (!focus && Started) { Paused = true; input = default; accumulator = 0; } }
        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape) && Started) TogglePause();
            if (!Started || Paused || Simulation.State.dead || Simulation.State.stage == MissionStage.Complete) return;
            var cam = view.GameCamera;
            var move = new Vector3((Input.GetKey(KeyCode.D) ? 1 : 0) - (Input.GetKey(KeyCode.A) ? 1 : 0), 0,
                                  (Input.GetKey(KeyCode.W) ? 1 : 0) - (Input.GetKey(KeyCode.S) ? 1 : 0));
            var forward = Vector3.ProjectOnPlane(cam.transform.forward, Vector3.up).normalized;
            var direction = cam.transform.right * move.x + forward * move.z;
            input.move = new Point(direction.x, direction.z);
            Ray ray = cam.ScreenPointToRay(Input.mousePosition);
            if (new Plane(Vector3.up, Vector3.zero).Raycast(ray, out float distance))
            { Vector3 target = ray.GetPoint(distance); input.aim = new Point(target.x, target.z) - Simulation.State.player; }
            input.attack = Input.GetMouseButton(0); input.reclaim = Input.GetMouseButton(1);
            input.dodge |= Input.GetKeyDown(KeyCode.Space); input.shield |= Input.GetKeyDown(KeyCode.Q);
            input.pull |= Input.GetKeyDown(KeyCode.F); input.interact |= Input.GetKeyDown(KeyCode.E);
            accumulator += Mathf.Min(Time.unscaledDeltaTime, .1f);
            while (accumulator >= 1f / 60)
            {
                Simulation.Tick(1f / 60, input); accumulator -= 1f / 60;
                view.PlayEvents(Simulation.Events, SoundEnabled, LowEffects);
                foreach (var e in Simulation.Events) if (!string.IsNullOrEmpty(e.message) && e.kind == "note") Tell(e.message);
                input.dodge = input.shield = input.pull = input.interact = false;
            }
            noticeTime -= Time.unscaledDeltaTime; if (noticeTime <= 0) Notice = "";
        }
        void LateUpdate() { if (Simulation != null) view.Sync(Simulation.State); }
    }
}
