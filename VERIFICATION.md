# M001 프로토타입 검증 기록

실행일: 2026-09-07 · 환경: macOS ARM64 · .NET SDK 8.0.424

## 수행 결과

| 확인 | 결과 |
|---|---|
| 순수 C# Domain 컴파일 및 실행 | 통과 |
| 전투·회수·구조·체크포인트 규칙 | 20개 통과 |
| 실제 파일 저장·원자적 교체·백업·손상 검출 | 2개 통과 |
| 전체 C# 소스 구문 분석 | 10개 파일, 오류 0 |
| manifest 및 assembly definition JSON | 파싱 통과 |
| Unity 에셋 GUID | 24개 고유, 장면의 스크립트 참조 해결 |
| Test Framework 패키지 | 공식 레지스트리에서 1.4.6 확인 |
| Unity 6000.3.23f1 실제 import·C# 컴파일·URP 설정 | 통과, batchmode 종료 코드 0 |
| Unity EditMode | 1개 테스트 메서드 안의 공통 규칙 20개 통과 |
| Unity PlayMode | BootstrapCreatesCameraAndPausedTitle 통과 |
| Unity Hub | 3.21.0 설치, 에디터 6000.3.23f1 ARM64 및 프로젝트 등록 확인 |
| 실제 GUI Play 모드 | Bootstrap 장면, 한글 타이틀, 새 출동 버튼, 쿼터뷰 3D 블록아웃 표시 확인 |

총 **22개 테스트 통과, 실패 0**. 규칙 테스트는 Unity에서 사용하는 실제 Domain 소스를 직접 컴파일한다. Unity 화면과 API 바인딩을 모사한 테스트가 아니다.

## 아직 수행하지 않은 확인

아래 항목은 아직 수행하지 않았다.
- 실제 입력에 따른 완주, 전투 HUD 가독성, 오디오, 장면 전체 렌더링 품질, 카메라 가려짐
- macOS/Windows 실행 파일 빌드, FPS와 메모리, 20분 콘텐츠 길이

공식 ARM64 설치 프로그램의 Unity Technologies 서명을 macOS에서 확인한 뒤 설치했다. 설치된 에디터 위치는 `/Applications/Unity/Unity-6000.3.23f1/Unity.app`이다. 설치 후 임시 설치 프로그램만 삭제했다. 최초 import에서 독립 패키지로 존재하지 않는 `com.unity.modules.inputlegacy`와 `com.unity.modules.textrendering` 선언을 제거했으며, 그 뒤 실제 import/컴파일에 성공했다. 테스트 결과는 [EditMode XML](verification/unity-editmode.xml), [PlayMode XML](verification/unity-playmode.xml)에 보관했다. PlayMode 통과는 부트스트랩 자동 검사 범위이며 전체 게임 완주나 최종 렌더링 품질 인증을 의미하지 않는다.

## 재현

상위 SeoulLastReclaimer 폴더에서 .NET 8 SDK로 실행한다.

```sh
dotnet run --project tests/DomainChecks.csproj
dotnet run --project tests/SyntaxChecks.csproj
```

이번 실행에 사용한 임시 SDK는 `/private/tmp/slr-dotnet/dotnet`이다. 다른 장치나 임시 폴더 정리 이후에는 설치된 `dotnet`을 사용한다. 테스트는 외부 NuGet 패키지 없이 수행하며, Unity 패키지는 별도로 Unity Package Manager가 관리한다.

Unity 실행 절차는 [Unity/README.md](Unity/README.md)를 따른다. 외부 플레이테스트와 출시 QA는 기존 `design` 문서에서 미실시 상태를 유지한다.
