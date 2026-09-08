# Unity M001 프로토타입

**Unity Hub에 추가할 폴더는 이 `Unity` 폴더입니다.** 상위 SeoulLastReclaimer는 문서와 테스트를 함께 담는 프로젝트 저장소입니다.

## 열기

1. Unity Hub에서 Unity **6000.3.23f1 (6.3 LTS)** 에디터를 설치합니다. 현재 Mac은 Apple Silicon이므로 ARM64 에디터를 선택합니다. Windows 빌드는 Windows Build Support (Mono) 모듈이 필요합니다.
2. Hub의 프로젝트 추가에서 이 폴더를 선택합니다.
3. 첫 패키지 가져오기와 스크립트 컴파일이 끝날 때까지 기다립니다. 초기화 코드가 URP 렌더러·파이프라인·기본 머티리얼을 만들고 빌드 장면을 등록합니다.
4. `Assets/SLR/Scenes/Bootstrap.unity`를 열고 Play를 누릅니다. `SLR > Open first mission` 메뉴도 같은 장면을 엽니다.
5. Game 창의 **새 출동**을 누른 뒤 Game 창에 포커스를 둡니다.

현재 장치에는 Unity Hub 3.21.0과 Unity Editor 6000.3.23f1 ARM64가 설치되어 있으며, Hub에 에디터와 프로젝트를 연결했습니다. 에디터 위치는 `/Applications/Unity/Unity-6000.3.23f1/Unity.app`입니다. 실제 Editor import/컴파일과 EditMode·PlayMode 부트스트랩 테스트를 통과했습니다. 전체 임무 완주와 플랫폼 빌드는 아직 검증하지 않았습니다.

## 조작

| 입력 | 동작 |
|---|---|
| WASD | 화면 방향 기준 이동 |
| 마우스 | 지면 조준 |
| 좌클릭 유지 | 파편격, 자원 소모 없음 |
| 우클릭 유지 | 0.4초 뒤 잔향 회수, 이동 속도 절반 |
| Space | 체력 25를 사용한 회피 |
| Q | 잔금막. 구조 단계에서 지지점 옆이면 설치 |
| F | 조준한 적 견인 / 창고 입구 선반 이동 |
| E | 구조 배터리 또는 출구 상호작용 |
| Esc | 일시정지·옵션·체크포인트 재시도 |

에너지가 부족하면 적을 기본 공격으로 처치한 뒤 잔향을 회수합니다. 모든 자원을 소진해 진행할 수 없으면 Esc의 체크포인트 재시도로 해당 구간의 적·잔향·에너지를 함께 복원할 수 있습니다. 포커스를 잃으면 자동으로 일시정지합니다.

## 첫 임무

청백색 잔향 회수 → 선반을 F로 이동 → 적 7체 정리 → 두 지지점 옆에서 Q를 각각 사용 → 20초 대피 방어 → 보스 해체 → 북쪽 구조 차량에서 E로 귀환 확인.

첫 회수, 창고 정리, 보스 진입에 체크포인트가 있습니다. 체크포인트 도달 시 HP와 회피 체력을 회복합니다. 두 지지점에 설치한 잔금막은 휴대 방벽의 3초 제한과 달리 해당 대피 구간 동안 유지합니다. 보스는 1400 HP이며 기둥으로 돌진을 유도하면 3초간 방어력이 0이 됩니다. 기둥을 모두 소진해도 기본 공격으로 처치할 수 있습니다.

## 구현 경계

- Domain: 순수 C# 임무·피해·회수·이동 충돌·적 상태·체크포인트 저장 규칙.
- Runtime: Unity 카메라, 키보드/마우스 입력, 절차형 3D 블록아웃, IMGUI HUD, 임시 효과음과 VFX.
- Editor: 첫 import 설정, 장면 열기, 플랫폼 빌드 메뉴.
- Tests: 공통 규칙 검증과 별도 Play Mode 부트스트랩 테스트.

검증용 맵은 약 36×54m로 축소했습니다. 원안의 96×64m/초회 20분 전체 버티컬 슬라이스는 아닙니다. 일반 공격 탐색 반경은 조작 검증을 위해 2.8m, 구조 배터리는 40 에너지입니다. 도식 증거·크레딧 지갑과 성장 화면은 아직 구현하지 않았고 완료 플래그/단일 완료 이벤트까지만 포함합니다. NPC 대피 표현은 인원별 위치 전환이며 경로 애니메이션은 후속 작업입니다. 보스의 단계별 패턴은 돌진·지정 위치 포격·빠른 재돌진의 축소 버전입니다.

에셋은 코드로 만든 블록아웃이며 최종 캐릭터 FBX, 리그, 실제 음원과 컷신이 아닙니다. 기존 기획 이미지는 상위 `design/art`에서 확인합니다. 키보드·마우스만 지원하며 패드·재매핑은 미구현입니다. 한글은 macOS의 Apple SD Gothic Neo, Windows의 맑은 고딕을 우선 사용합니다. 출시 빌드에는 재배포 가능한 한글 폰트를 별도 반입해야 합니다.

## 저장

Unity `Application.persistentDataPath/M001/current.slrsave`에 로컬 저장합니다. 현재 파일과 `.backup`을 유지하고 임시 파일 검증 후 원자적으로 교체합니다. 첫 버전은 **1개 슬롯**이고 3슬롯과 버전 마이그레이션은 후속 작업입니다. 지원하지 않는 버전은 거절합니다. 손상 시 자동 덮어쓰지 않고 UI의 백업 복원을 선택할 수 있습니다. 새 출동 시 현재 체크포인트 교체를 명시적으로 확인합니다.

## 테스트와 빌드

- Unity: `Window > General > Test Runner`에서 EditMode와 PlayMode를 각각 실행합니다.
- 순수 C# 검증: 상위 프로젝트에서 `.NET 8 SDK`로 `dotnet run --project tests/DomainChecks.csproj`.
- C# 구문 검사: `dotnet run --project tests/SyntaxChecks.csproj`. Unity API 호환성이나 렌더링 검증을 대신하지 않습니다.
- macOS: `SLR > Build macOS prototype`.
- Windows: 지원 모듈 설치 후 `SLR > Build Windows prototype`.
- CLI EditMode: `Unity -batchmode -projectPath <이 폴더 절대경로> -runTests -testPlatform EditMode -testResults <결과 XML 절대경로> -logFile <로그 절대경로>`. GUI 에디터와 동일한 프로젝트를 동시에 열지 마세요.

첫 import 뒤 생성되는 URP 설정과 기본 머티리얼은 프로젝트 소스로 보관하고 `Library`, `Temp`, `Logs`는 제외합니다.

## 공식 기준

- [고정 에디터 6000.3.23f1 릴리스](https://unity.com/releases/editor/whats-new/6000.3.23f1)
- [Unity 6.3의 URP 17.3](https://docs.unity3d.com/6000.3/Documentation/Manual/com.unity.render-pipelines.universal.html)
- [Unity Hub 에디터 설치](https://docs.unity.com/en-us/hub/add-editor)

URP는 에디터와 함께 제공되는 Core 패키지 17.3.0, Test Framework는 공식 패키지 레지스트리에서 존재를 확인한 1.4.6으로 고정했습니다. 정확한 의존성은 실제 Unity import가 생성한 `Packages/packages-lock.json`에 기록되어 있습니다. `inputlegacy`와 `textrendering`은 이 에디터에서 독립 UPM 패키지가 아니므로 manifest에 선언하지 않습니다.
