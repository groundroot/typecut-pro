# 수정 대상 체크리스트 (죽은 것 · 부족한 것)

> `docs/FEATURE-STATUS.md` 점검 결과에서 **동작**이 아닌 항목만 뽑았다.
> **코덱스 검증 완료 (2026-08-11, task-msny5lmv-n2nldz).** 검증에서 진단 3건이 뒤집혔고
> 새 항목 5건이 추가됐다 — 아래는 검증 후 기준이다.
>
> 검증 대상은 문서 저장소가 아니라 최신 브랜치다:
> 앱 `figma-design-system` · 엔진 `feat/issue-8-9-container`.

## 상태 표기

- `[ ]` 미착수 · `[~]` 진행 중 · `[x]` 완료(리뷰 통과)

## 검증에서 뒤집힌 것 — 먼저 읽을 것

| 원래 적었던 것 | 실제 |
|---|---|
| B1 "AI 자막 분리(`ai_edit.py`)를 제거" | **위험한 오진.** `ai_edit.py`는 자막 분리가 아니라 **공용 LLM 로더**이고 `agent_edit`·`ai_correct`·`chapters`·`retranscribe` 4곳이 쓴다. 지웠으면 사고였다. 죽은 것은 `retranscribe.py:2126`의 `polish_subtitles` 호출 분기 — **존재하지 않는 함수를 부른다** |
| A1 "모델 설치 UI가 없음" | 설치 화면은 **이미 있다**(ASR·정렬 모델용). 없는 것은 그 화면이 **화자분리 모델을 관리하지 않는다**는 것. 위험도 낮음 → **높음** |
| A2 "미사용 도움말 20개" | 실제 **18개**. 목록 확보 |

---

## 1순위 — 배포 계약 (조용한 품질 저하를 막는다)

- [ ] **N1. 고정밀 화자분리 배포 계약 일치**
  앱 설치 화면(`SettingsView`)은 ASR·정렬 모델만 관리하고 FluidAudio 분리 모델은
  `requiredModels`에 없다. 엔진은 `models-manifest.json`과 `FCPA_DIARIZE_MODELS`를 기대한다.
  **앱 UI · 번들 · 환경변수 · manifest가 같은 모델을 가리키는지**가 핵심이다.
  대상: `SettingsView.swift`, `JobRunner.swift`, `build_app.sh`
  위험: **높음** — 지금은 개발 맥에서만 고정밀이 동작한다

- [ ] **N2. 고정밀 실패 사유를 사용자에게 보이기**
  엔진은 `binary_missing`·`model_missing`·`inference_failed`를 구조화 이벤트로 남기는데
  화면에 나오지 않는다. **사용자는 왜 기본 분리로 내려갔는지 알 수 없다** — 조용한 품질 저하다.
  대상: `JobRunner.swift`(`@evt` 소비), 결과·진행 화면
  위험: 중간 · 선행: 없음(N1과 병행 가능)

- [ ] **C2. 기본 분리를 고정밀로 대체**
  resemblyzer는 실측 한계다(마진 0.058, 지도 분류 상한 82.8%). 클러스터링 개선은 소진.
  → **N1 완료 후 고정밀을 기본 경로로.** 단 UI만으로는 부족하고 배포 계약 전체가 필요하다.
  선행: **N1** · 위험: 모델 배포 용량(21MB)

## 2순위 — 값싼 완성도

- [ ] **A2. 옵션 인라인 설명 (미사용 18개)**
  번역까지 끝난 문구가 화면에서 한 번도 안 쓰인다. 붙이기만 하면 된다.
  ```
  side.speaker_detection.help   side.speakers.help    stt.model.help
  side.vocab.help               side.group_storyline.help
  side.fill_gaps.help           side.replace_buffer.help
  side.filler_cut.help          side.ai_typo.help
  done.edit_transcript.help     ed.full_view.help     ed.length.help
  ed.two_line.help              ed.mode.help          ed.silence.help
  ed.delete.help                ed.undo.help          ed.redo.help
  ```
  대상: `DSForm.swift`(`help:` 파라미터), `SettingsView.swift`(표시 토글)
  위험: **낮음**

- [ ] **A3. 로그 보기를 메뉴바로**
  지금은 실패 흐름에서만 열린다. 성공한 작업의 로그를 볼 방법이 없다.
  대상: `FCPAutoCutApp.swift`(CommandMenu 신설), `ContentView.swift`
  위험: 낮음~중간

- [ ] **N3. 죽은 legacy 분기 정리**
  `retranscribe.py:2126-2141`이 **존재하지 않는** `ai_edit.polish_subtitles`를 부른다.
  `retranscribe.py` 자체는 죽지 않았다 — `engine.py`가 유틸 여러 개를 실제로 쓴다.
  **파일 삭제가 아니라 죽은 분기만** 걷어낸다.
  위험: 중간 (되살릴 계획이 있다면 문서화로 대체)

## 3순위 — 기능 신규

- [ ] **A4. 화자 이름 편집**
  데이터 자리는 있고 화면과 출력 반영 경로가 없다. 문자열 치환이 아니라
  role→name 매핑을 FCP 롤·내보내기까지 관통시켜야 한다.
  대상: `TranscriptEditorView.swift`, `ProjectDocument.swift`, 엔진 롤 생성부
  위험: **중간~높음**

- [ ] **B2. 에이전트 편집 — 대화 이력 방향 결정**
  매 요청이 독립이다(직전 `snapshot()` 하나만 보존). 둘 중 하나:
  (a) UI를 정직하게 — 각 턴을 독립 카드로, 이어지는 채팅처럼 그리지 않는다
  (b) 진짜 멀티턴 — 엔진 계약과 UI 상태 모델을 함께 바꾼다
  위험: (a) 낮음 / (b) **중간~높음**

- [ ] **B3. 에이전트 대화 로그 화면**
  선행: **B2 방향 결정** · 위험: 낮음

- [ ] **N4. 크로스프로세스 계약 테스트**
  Swift UI → 번들 파이썬 → JSON → Swift 적용의 **전체 경로** 테스트가 없다.
  모델 없음·잘못된 JSON·프로세스 종료·타임아웃·폴백 표시를 실제 프로세스 수준에서.
  위험: 중간 (없으면 배포 후에야 드러난다)

## 4순위 — 판정 대기 · 대형

- [ ] **C1. "말끝이 잘린다" 잔여 원인** — *사용자 확인 대기*
  두 독립 엔진이 **둘 다** 화자가 바뀐다고 하는 48.7초·53.4초가 실제로 두 사람인가.
  - 두 사람 → 자막 분할 정책(맞장구 1단어가 카드를 새로 만드는 문제)만 고친다
  - 한 사람 → 분리 자체를 더 파야 한다
  선행: **사용자 판정** · 코덱스도 "듣지 않고는 판단 불가"로 확인

- [ ] **C3. 겹침 발화 2줄 자막**
  `overlap_segments` 계약과 검증은 있으나 엔진 출력·UI 소비 경로가 없다.
  엔진·데이터 모델·자막 UI 모두 신규.
  선행: C1 판정 · 위험: **높음**

- [ ] **D1. 앱스토어 제출**
  A1~A3만으로 선행조건이 충족되지 않는다. **고정밀 모델 내려받기 · 샌드박스
  네트워크 · 앱 컨테이너 저장 위치**가 심사 리스크다.
  선행: N1 · 위험: **높음**

- [ ] **N5. 문서 기준 커밋 고정**
  문서는 v0.13.4 기준인데 최신 브랜치에는 후속 구현이 들어가 있어 수치가 어긋났다
  (A1·A2가 실제로 그랬다). 다음 점검부터 대상 커밋을 명시한다.

---

## 권장 구현 순서 (코덱스)

```
N1/A1 배포 계약 + N2 사용자 표시
  → C2 기본 분리 정책 확정
  → A2 → A3 → A4
  → B2 → B3
  → N3/N4
  → C1/C3 → D1
```

**가장 먼저 N1**: 지금 고정밀 분리가 없는 맥에서 **조용히** 품질이 떨어지고,
설치 UI가 있어도 화자분리 모델을 관리하지 않아 출시 후 핵심 기능이 사용자
환경에 따라 달라진다.
