# 기술 설계

## 엔진 결정
Unity 6 계열의 지원되는 LTS와 URP를 후보 기준으로 한다. 실제 개발 시작 때 공식 릴리스 상태, 필요한 패키지 호환성, 타깃 빌드를 검사하고 정확한 Editor 버전을 ProjectVersion.txt에 고정한다. 임의의 최신 버전 자동 업데이트는 하지 않는다. C# 싱글플레이 구조이며 실시간 게임 서버는 없다. Shader Graph와 파티클을 기본으로 하고 GPU VFX는 목표 장치에서 검증된 효과에만 사용한다.

## 코드 경계
Domain에는 피해 계산, 재화 거래, 도식 상태, 임무 조건의 순수 C# 규칙을 둔다. Application에는 CastSkill, CollectResidue, CompleteMission, PurchaseItem 같은 유스케이스를 둔다. Unity 어댑터는 입력, 물리, 애니메이터, 오디오, UI, 저장 경로를 연결한다. MonoBehaviour가 지갑과 저장을 각각 직접 수정하지 않게 한다. 부트스트랩 Scene이 서비스와 콘텐츠 카탈로그를 만들고 씬 전환은 SceneFlow가 관리한다.

## 주요 모듈
InputAdapter는 ActionCommand를 만든다. CharacterMotor는 지면 이동과 충돌을 처리한다. CombatResolver는 HitRequest를 받아 HitResult를 반환한다. SkillRunner는 시전 상태와 쿨다운을 관리한다. ResidueService는 토큰 ID와 수량을 단독 관리한다. MissionDirector는 목표 상태와 체크포인트를 관리한다. ProgressionService는 레벨과 도식 해금을 계산한다. SaveRepository는 검증과 원자적 파일 교체를 수행한다. UI Presenter는 결과를 표시한다.

## 이벤트 예시
SkillCastStarted(castId, skillId, actorId), DamageApplied(hitId, sourceId, targetId, amount), ResidueCollected(tokenId, amount), ObjectiveChanged(objectiveId, state), MissionCommitted(transactionId), SaveFailed(reasonCode)를 사용한다. 화면 표현용 이벤트와 권위 있는 상태 변경을 구분한다. 피해 이벤트를 구독한 이펙트가 다시 피해를 발생시키지 않는다.

## 저장
로컬 저장 슬롯 3개, 슬롯마다 current.json과 backup.json을 둔다. 임시 파일에 새 JSON을 쓰고 다시 읽어 스키마와 체크섬을 검사한 뒤 같은 디렉터리에서 원자적으로 이름을 교체한다. 체크섬은 손상 감지용이며 부정행위 방지 서명이 아니다. 저장 필드는 schemaVersion, contentVersion, saveId, committedTransactions, campaign, player, inventory, checkpoint, settings다. player에는 level, xp, equippedSkills, unlockedSkills를 포함한다. 임무 체크포인트는 적, 토큰 소비, 구조 목표, 임시 획득을 함께 저장한다.

## 마이그레이션
schemaVersion 1을 초기 버전으로 두고 이전 버전은 변환 함수 체인을 거친다. 미래 버전 파일은 덮어쓰지 않고 지원하지 않는 버전 안내를 한다. 보상 처리 transactionId는 임무 instanceId와 objectiveId로 생성하고 저장 레코드에 남긴다. 결과 화면 재진입, 강제 종료, 백업 복원 경로에서 중복 보상을 테스트한다. 설정 파일 손상은 기본값으로 복원할 수 있으나 진행 데이터 손상은 사용자에게 알린다.

## 장면과 자원
Bootstrap, Frontend, Hub, Mission을 분리한다. EV01부터 EV06까지 환경 프리팹과 조명 데이터를 재사용한다. 토큰, 투사체, 피격 VFX, 데칼은 풀링한다. 논리 토큰과 렌더링 입자를 분리하여 멀리 있는 토큰 표현을 줄여도 자원 판정은 보존한다. 런타임 전체 오브젝트 검색과 매 프레임 문자열 ID 검색을 피하고 카탈로그를 로딩 시 구성한다.

## AI
적은 Idle, Acquire, Telegraph, Attack, Recover, Stagger, Dead 상태를 사용한다. Acquire에서 시야와 navFloorId를 검사한다. Telegraph에 들어간 공격은 castId를 고정하고 타깃 변경 규칙을 공격 데이터에 명시한다. 죽은 적의 스폰 슬롯과 토큰 생성은 단 한 번 해제한다. 구조 NPC는 지정 경로를 따르며 전투 AI를 공유하지 않는다.

## 네트워크
출시 게임은 오프라인 실행이 가능하다. 자체 로그인, 온라인 경제, 매치메이킹, 서버 API를 구현하지 않는다. Steam 구매와 배포는 플랫폼 기능이다. 업적과 Steam Cloud는 별도 어댑터로만 검토하며 선택 통합 전에는 해당 데이터 흐름을 개인정보 문서에 반영한다. VS는 Steam SDK 없이 실행한다. 스토어와 관계없이 로컬 저장이 동작해야 한다.

## 빌드와 테스트
유닛 테스트는 피해 내림, 자원 포화, 중복 회수, 거래 원자성, 해금 조건, 저장 마이그레이션을 다룬다. PlayMode는 벽 관통, 높이층 분리, HUD 포커스, 게임패드 연결 해제를 다룬다. CI는 데이터 스키마 검증, ID 중복 검사, 참조 누락, 테스트, Windows 빌드 순으로 수행한다. 빌드 태그, 콘텐츠 버전, 해시와 테스트 보고서를 함께 보관한다.
