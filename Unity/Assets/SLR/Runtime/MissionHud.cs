using SLR.Domain;
using UnityEngine;

namespace SLR.Runtime
{
    public sealed class MissionHud : MonoBehaviour
    {
        MissionController game; WorldView view; Font font;
        GUIStyle title, heading, text, small, button;
        bool stylesReady, confirmNew;
        static readonly Color Ink = new Color(.045f, .075f, .1f, .95f);
        static readonly string[] Objectives = {
            "우클릭으로 첫 잔향 회수", "F로 선반을 옮기고 창고의 적 정리", "두 지지점 가까이서 Q로 잔금막 설치",
            "20초 동안 대피 통로 방어", "적재장 융합체 해체", "구조 차량에서 E · 귀환 확인", "일곱 명 전원 귀환"
        };
        public void Initialize(MissionController controller, WorldView world) { game = controller; view = world; }
        void Styles()
        {
            if (stylesReady) return;
            font = Font.CreateDynamicFontFromOSFont(new[] { "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Arial" }, 24);
            text = new GUIStyle(GUI.skin.label) { font = font, fontSize = 20, wordWrap = true };
            text.normal.textColor = new Color(.91f, .93f, .92f);
            title = new GUIStyle(text) { fontSize = 56, fontStyle = FontStyle.Bold };
            heading = new GUIStyle(text) { fontSize = 26, fontStyle = FontStyle.Bold };
            small = new GUIStyle(text) { fontSize = 16 };
            button = new GUIStyle(GUI.skin.button) { font = font, fontSize = 22, padding = new RectOffset(16, 16, 10, 10) };
            stylesReady = true;
        }
        static void Panel(Rect r, Color color) { var old = GUI.color; GUI.color = color; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = old; }
        void Label(float x, float y, float w, float h, string value, GUIStyle style = null) => GUI.Label(new Rect(x, y, w, h), value, style ?? text);
        bool Button(float x, float y, float w, string value) => GUI.Button(new Rect(x, y, w, 50), value, button);
        void Bar(float x, float y, float w, string name, float value, float max, Color color)
        {
            Label(x, y, w, 26, name + "   " + Mathf.CeilToInt(value) + " / " + max, small);
            Panel(new Rect(x, y + 30, w, 6), new Color(.2f, .26f, .29f));
            Panel(new Rect(x, y + 30, w * Mathf.Clamp01(value / max), 6), color);
        }
        void OnGUI()
        {
            if (game == null || game.Simulation == null) return;
            Styles(); float scale = Mathf.Min(Screen.width / 1600f, Screen.height / 900f);
            var previous = GUI.matrix;
            GUI.matrix = Matrix4x4.TRS(new Vector3((Screen.width - 1600 * scale) / 2, (Screen.height - 900 * scale) / 2), Quaternion.identity, Vector3.one * scale);
            var s = game.Simulation.State;
            if (!game.Started)
            {
                Panel(new Rect(0, 0, 720, 900), Ink);
                Label(65, 90, 600, 35, "SEOUL LAST RECLAIMER  /  M001", small);
                Label(60, 160, 630, 160, "서울의\n마지막 회수자", title);
                Label(65, 350, 560, 45, "01    전투가 끝난 뒤에 들어가는 사람들", heading);
                Label(65, 410, 545, 80, "구로 물류센터에 일곱 명이 남아 있다.\n버려진 힘을 회수하고, 돌아올 길을 만들어라.");
                if (Button(65, 530, 500, confirmNew ? "새 출동 확인 · 기존 체크포인트 교체" : "새 출동"))
                { if (game.CanContinue && !confirmNew) confirmNew = true; else { game.Begin(false); confirmNew = false; } }
                if (game.CanContinue && Button(65, 595, 500, "체크포인트 이어하기")) { game.Begin(true); confirmNew = false; }
                if (game.HasBackup && game.SaveError.Length > 0 && Button(65, 660, 500, "백업 체크포인트 복원")) game.RestoreBackup();
                Label(65, 745, 570, 75, game.SaveError.Length > 0 ? game.SaveError : "키보드·마우스 프로토타입 · Unity 6.3 LTS\n블록아웃 v0.1 / 최종 아트 및 밸런스 미적용", small);
            }
            else
            {
                Panel(new Rect(30, 30, 315, 210), Ink);
                Label(50, 45, 270, 40, "윤태경   /   회수 기사", heading);
                Bar(50, 94, 275, "생명", s.hp, 120, WorldView.Orange);
                Bar(50, 150, 275, "회피 체력", s.stamina, 100, new Color(.86f, .81f, .65f));
                Panel(new Rect(1060, 30, 510, 165), Ink);
                Label(1085, 46, 460, 27, "구로 물류센터  ·  " + (int)(s.time / 60) + ":" + ((int)s.time % 60).ToString("00"), small);
                Label(1085, 84, 450, 64, Objectives[(int)s.stage], heading);
                Label(1085, 150, 450, 30, "귀환 인원  " + s.rescued + " / 7   ·   Esc 일시정지", small);
                Panel(new Rect(30, 760, 315, 110), Ink); Bar(50, 780, 275, "회수 에너지", s.energy, 100, WorldView.Cyan);
                Panel(new Rect(400, 760, 780, 110), Ink);
                Label(425, 775, 730, 30, "Q  잔금막  " + Cooldown(s.shieldCooldown, 20) + "      F  견인선  " + Cooldown(s.pullCooldown, 12));
                Label(425, 824, 730, 30, "WASD 이동   좌클릭 공격   우클릭 회수   Space 회피   E 상호작용", small);
                if (s.stage == MissionStage.Evacuation)
                { Panel(new Rect(490, 200, 620, 105), Ink); Bar(515, 220, 570, "대피 진행", s.evacuation, 20, WorldView.Cyan); Label(515, 270, 570, 30, "통로 위험도 " + Mathf.CeilToInt(s.danger) + "%", small); }
                foreach (var e in s.enemies)
                    if (e.kind == EnemyKind.Forklift && e.hp > 0 && s.stage == MissionStage.Boss)
                    { Panel(new Rect(420, 40, 620, 94), Ink); Bar(445, 56, 570, "BS001 적재장 융합체  ·  " + e.phaseNumber + "단계", e.hp, e.maxHp, WorldView.Orange); }
                if (game.Notice.Length > 0)
                { Panel(new Rect(400, 652, 790, 76), Ink); Label(425, 665, 740, 55, game.Notice); }
                if (game.SaveError.Length > 0)
                { Panel(new Rect(30, 260, 450, 145), Ink); Label(50, 275, 410, 65, game.SaveError, small); if (Button(50, 340, 280, "저장 재시도")) game.RetrySave(); }
                if (game.Paused || s.dead || s.stage == MissionStage.Complete)
                {
                    Panel(new Rect(0, 0, 1600, 900), new Color(.03f, .05f, .07f, .8f));
                    Panel(new Rect(430, 200, 740, 490), Ink);
                    Label(480, 235, 640, 75, s.stage == MissionStage.Complete ? "일곱 명, 모두 돌아왔다." : s.dead ? "출동 중단" : "잠시 숨을 고르다", heading);
                    Label(480, 325, 640, 70, s.stage == MissionStage.Complete ? "해체 " + s.kills + "체 · 회수 " + s.collected + " 에너지\n그날의 작업일지에는, 들어간 사람과 돌아온 사람의 수가 같았다." : s.dead ? "직전 체크포인트에서 현장 상태를 함께 복원합니다." : "현장은 멈춰 있습니다. 준비되면 다시 출동하세요.");
                    if (s.stage == MissionStage.Complete)
                    { if (Button(480, 490, 640, "출동 화면으로")) game.Title(); }
                    else
                    {
                        if (!s.dead && Button(480, 420, 640, "현장 복귀")) game.TogglePause();
                        if (Button(480, 485, 640, "체크포인트 재시도")) game.Retry();
                        game.SoundEnabled = GUI.Toggle(new Rect(485, 558, 310, 30), game.SoundEnabled, " 효과음", text);
                        game.LowEffects = GUI.Toggle(new Rect(810, 558, 310, 30), game.LowEffects, " 이펙트 줄이기", text);
                        if (Button(480, 615, 640, "출동 화면으로")) game.Title();
                    }
                }
            }
            GUI.matrix = previous;
            if (game.Started && !game.Paused && !s.dead && s.stage != MissionStage.Complete) WorldLabels(s);
        }
        static string Cooldown(float seconds, int cost) => seconds > 0 ? seconds.ToString("0.0") + "초" : "준비 / " + cost;
        void WorldLabel(Point p, string value)
        {
            var screen = view.GameCamera.WorldToScreenPoint(WorldView.V(p, 2)); if (screen.z <= 0) return;
            var r = new Rect(screen.x - 100, Screen.height - screen.y, 200, 26);
            Panel(r, Ink); GUI.Label(r, value, small);
        }
        void WorldLabels(WorldState s)
        {
            if (!s.shelfMoved) WorldLabel(Level.Shelf, "F  견인 가능한 선반");
            if (s.stage == MissionStage.Supports)
            {
                WorldLabel(Level.SupportA, s.supportA ? "지지점 A · 고정 완료" : "Q  지지점 A 고정");
                WorldLabel(Level.SupportB, s.supportB ? "지지점 B · 고정 완료" : "Q  지지점 B 고정");
                if (!s.batteryTaken) WorldLabel(Level.Battery, "E  구조용 배터리");
            }
            if (s.stage == MissionStage.Exit) WorldLabel(Level.Exit, "E  일곱 명 귀환 확인");
        }
    }
}
