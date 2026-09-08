# 데이터와 연동 명세

## 기준 형식
data/game_data.json은 문서 버전 0.1의 런타임 입력 예시다. data/game_data.schema.json에 타입과 수치 범위를 정의한다. 모든 ID는 문자열, 시간은 초, 거리는 m, 확률은 0~1, 수량은 정수다. 게임 시작 때 전체 검증을 마친 데이터만 로드한다. 누락된 참조는 0값으로 대체하지 않고 빌드 오류로 처리한다.

## SkillDef
id, name_ko, energy_cost, cooldown_s, coefficient, range_m, duration_s, unlock_mission, slot_type 필드를 가진다. id는 SK 세 자리, slot_type은 common, active, ultimate 중 하나다. 시작 해금의 unlock_mission은 빈 문자열이다. coefficient가 0인 지원 기술은 피해를 발생시키지 않는다. SK001의 attack_interval_s는 전역 설정을 사용한다.

## EnemyDef
id, hp, armor, attack, telegraph_s, residue_energy, alloy_probability, research_probability 필드를 가진다. 에너지 드롭은 확률 드롭과 분리한다. 보스는 BS 세 자리이며 단계별 행동은 별도 encounter 정의로 연결한다. HP는 1 이상, 방어력은 0 이상이다.

## MissionDef
id, chapter, level_id, name_ko, recommended_level, credits, xp, required_rescues, boss_id를 가진다. 구조가 없는 임무는 required_rescues 0이다. 단계별 목표는 objective_defs에서 별도 정의한다. 임무 완료 보상은 missionInstanceId를 키로 확정한다. 추천 레벨은 안내이며 자동 적 보정에 쓰지 않는다.

## 내부 서비스 계약
CollectResidue(tokenId, actorId, requestId)는 collectedAmount, remainingTokenAmount, energyAfter를 반환한다. 같은 requestId는 같은 결과를 반환하고 두 번 소비하지 않는다. PurchaseItem(itemId, quantity, transactionId)는 Success, InsufficientCredits, InventoryFull, UnknownItem, SaveFailed 중 하나다. CommitMission(instanceId, checkpointId)는 미충족 목표가 있으면 ObjectiveIncomplete를 반환한다. 이 인터페이스는 프로세스 내부 호출이며 HTTP 서버가 아니다.

## 저장 데이터 예시
save_example.json은 schemaVersion 1, M001 체크포인트 CP1, 레벨 1과 30에너지, 임시 획득과 committedTransactions 배열을 포함한다. 기기 경로, OS 사용자명, 이메일을 저장 데이터에 포함하지 않는다. 클라이언트 로그는 에러 코드와 내부 ID를 사용하고 채팅이나 음성을 기록하지 않는다.

## 서버 API
v0.1에는 서버 연동이 없으므로 공개 API 엔드포인트, 인증 토큰, 계정 DB는 해당 없음이다. 향후 지원 접수나 선택 진단 업로드를 추가할 때 endpoint, 처리 목적, 보유기간, 동의, 실패 재시도와 데이터 삭제를 별도 변경 요청으로 작성한다. 미구현 API를 스토어 기능으로 홍보하지 않는다.

## 엑셀 반입
balance.xlsx의 표를 수정하면 해당 테이블을 값 CSV로 내보내고, 헤더 매핑과 ID 검증을 거쳐 JSON으로 전환한다. 수식 열은 계산 완료값을 사용한다. 공개 JSON에는 수식 문자열을 넣지 않는다. 현재 포함 CSV와 JSON은 같은 초기 가정에서 생성되었으며 이후 수정은 콘텐츠 버전을 올려 다시 검증해야 한다.
