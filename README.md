# 서울의 마지막 회수자 · Seoul Last Reclaimer

현대 서울을 배경으로 한 2.5D 쿼터뷰 액션 RPG 프로젝트입니다.

## 웹 비주얼 데모

[실사풍 구로 골목 웹 데모 안내](web/README.md) · [로컬 실행 화면](http://127.0.0.1:5178/)

`web` 폴더에 귀환광장·물류센터·학교·기록 보관구역의 4개 구역과 첫 챕터 주요 미션 3개, 동료 의뢰 4개를 추가했습니다. J로 출동과 의뢰를 확인하며, 완료 미션·의뢰 물품·보상은 브라우저에 저장됩니다. 우클릭 이동·공격·정면 방어·구조·보스·동료 대화와 자유탐방을 지원합니다. 외곽에는 이동 불가능한 도시 배경과 통제선을 두었습니다. 전체 Unity 게임의 웹 이식본은 아닙니다.

## Unity 프로토타입

[Unity 실행 안내](Unity/README.md) · [첫 프로토타입 범위](PROTOTYPE_PLAN.md)

Unity Hub에 이 저장소 아래 **Unity 폴더**를 등록했습니다. 고정 에디터는 6000.3.23f1이며, `Assets/SLR/Scenes/Bootstrap.unity`에서 시작합니다. 에디터 설치, 프로젝트 import/컴파일, Unity EditMode 규칙 테스트와 PlayMode 부트스트랩 테스트를 통과했습니다. 전체 임무 수동 완주와 플랫폼 빌드는 후속 검증입니다.

## 제작 자료

- [문서 목차](design/index.html)
- [전체 기획서](design/Complete_Design.html)
- [제작 패키지 안내](design/README.md)
- [게임 설계 중심 문서](design/docs/02_GDD.md)
- [밸런스·예산 시트](design/balance.xlsx)
- [캐릭터·환경 콘셉트](design/art/)
- [데이터와 제작 목록](design/data/)
- [원본 배포 ZIP](Seoul_Last_Reclaimer_Production_v0.1.zip)

## 현재 상태와 이어갈 작업

2026년 9월 7일 제작 패키지 v0.1의 파일 70개와 배포 ZIP을 원본 위치에서 복사했습니다. 원본은 보존했습니다. 이후 Unity M001 프로토타입 소스 프로젝트를 추가했습니다. 플랫폼 실행 파일은 아직 빌드하지 않았습니다.

첫 구현 대상은 M001 구로 물류센터의 약 20분 플레이 구간입니다. 세부 범위는 [레벨 디자인](design/docs/06_Level_Design.md), [기술 설계](design/docs/14_TDD.md), [마일스톤](design/docs/18_Milestones.md), [백로그](design/data/backlog.csv)를 참고합니다.

후속 개발에서는 이 폴더를 작업 공간으로 사용합니다. 현재 자료의 규칙은 GDD, 수치는 balance.xlsx, 구현 데이터 형식은 design/data/game_data.schema.json을 기준으로 합니다.

## 출처

- [이전 공유 대화](https://chatgpt.com/s/cx_6a9e7e89026481919bed3de5342cdef5)
- 원본 자료: `/Users/seohun/Documents/Codex/2026-09-07/new-chat/outputs/slr-production-v1`

캐릭터 이미지는 AI 생성 콘셉트이며, 밸런스는 검증 전 설계값입니다. 법률 문서는 검토용 초안이고 플레이테스트는 아직 수행되지 않았습니다.
