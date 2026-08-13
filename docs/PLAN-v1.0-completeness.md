# TypeCut Pro v1.0 완성도 계획

> 기준 앱: `figma-design-system` 브랜치, v0.13.29 (`VERSION:1`)  
> 기준 엔진: `Silence-Cutter` 브랜치 `feat/issue-8-9-container`  
> 이 문서는 코드 변경안이 아니라 v1.0 출하를 판정하는 측정·제품·배포 계획이다. 아래의 현재 동작은 인용한 파일과 줄에서 확인한 것만 사실로 취급한다.

## 제품 목표와 $49.99 판정 기준

**프로젝트 스캔 후 사용자가 자막 작업을 최대한 하지 않는 것. 해야 하더라도 쉽고 가볍고 빠르게.**

$49.99는 “기능이 많다”가 아니라, 실제 `.fcpxmld`를 넣고 결과를 FCP에 가져간 뒤 사람이 고칠 시간이 거의 남지 않을 때 명백한 헐값이다. 따라서 모든 항목은 다음 질문을 통과해야 한다.

1. 반복 작업을 없애는가?
2. 틀렸을 때 사용자가 원인을 알아내고 한 번에 고칠 수 있는가?
3. 같은 프로젝트에서 재실행해도 빨라지고, 결과가 측정 가능하게 좋아지는가?

그렇지 않은 항목은 v1.0에서 자른다. 특히 실측 채택률 0%인 AI 자막 분리 경로는 기능을 더 다듬지 않고 제거·비활성화 후보로 둔다 (`docs/FEATURE-STATUS.md:82-91`). 화자분리는 공식 비베타 빌드에서 현재 게이트가 꺼져 있으므로, 정확도와 배포 계약이 합격하기 전에는 가격의 핵심 약속으로 광고하지 않는다 (`docs/DEV-RECORD-diarization.md:1-5`).

## 1. 내일 실행할 측정 체계

### 1.1 실험 고정 규칙

프로젝트 10개를 `case_id`로 익명화해 한 번의 기준 실행으로 고정한다. 각 케이스에는 다음 메타데이터만 기록한다.

| 필드 | 값 |
|---|---|
| `case_id` | `p01`~`p10` (원본 파일명은 로컬 manifest에만) |
| `source_sha256` | `.fcpxmld` 번들과 참조 미디어의 SHA-256 |
| `timeline_duration_sec` | 타임라인 실제 길이 |
| `fps` | FCPXML sequence의 frame duration에서 계산 |
| `content_tags` | 인터뷰/강의/회의/독백/겹침/방언/음악 등 다중 선택 |
| `config` | 모델 ID, VAD 파라미터, 자막 길이, 화자 수, flags |
| `git` | 앱 commit, 엔진 commit, 하네스 commit |
| `hardware` | Mac 모델, macOS, 메모리, thermal 상태 |
| `run_id` | UTC timestamp + git short SHA |

`tools/e2e.py`는 이미 입력 사본만 수정하고 원본을 건드리지 않으며, 소재별 분석 캐시와 케이스별 출력 폴더를 분리한다 (`tools/e2e.py:7-14`, `206-233`, `257-267`). 이 구조를 유지하고 `--manifest cases.json`, `--run-id`, `--gold-dir`, `--json-report`를 추가한다. 매 실행 전에는 캐시를 새로 만들고, 동일 설정 반복 실행은 캐시 재사용 실행으로 따로 표시한다. 속도 비교에는 반드시 warm/cold를 구분한다.

### 1.2 값싼 ground truth 워크플로

사람이 모든 단어를 처음부터 타이핑하는 방식은 병목이므로 쓰지 않는다.

1. `e2e.py`가 각 `.fcpxmld`의 실제 타임라인 오디오를 추출하고, 엔진 결과를 JSONL로 저장한다. 현재 하네스는 자막 수·평균/최대 글자 수·컷 수·컷 시간·롤 수까지 추출할 수 있다 (`tools/e2e.py:164-202`).
2. 사람은 각 케이스 전체가 아니라 **발화 구간의 20~30초 stratified sample**만 듣는다. 각 케이스에서 무작위 5초 구간 2개, 경계 불확실 구간 3개, 겹침/침묵/고유명사 구간을 각각 최대 2개 선정한다. 총 약 3~5분/케이스, 10개 합계 30~50분을 예산으로 둔다.
3. Whisper/Qwen 결과 중 긴 공통 부분은 초안으로 쓰고, 사람은 오디오를 들으며 TSV를 수정한다. **초안과 gold를 혼동하지 않도록** `annotator`, `reviewed_at`, `audio_offset`, `source`를 저장한다.
4. 한 명이 1차 라벨, 다른 한 명이 경계·화자·구두점만 10개 중 20%를 재검수한다. 불일치가 10%를 넘으면 그 축만 재검수한다.
5. gold는 단어 텍스트, `start/end`, VAD speech/non-speech interval, speaker label, punctuation, subtitle break label을 갖는 JSONL이다. 원본 미디어를 외부로 보내지 않는다.

### 1.3 프로젝트 단위 지표와 합격선

아래는 v1.0 **초기 제안 임계값**이다. 10개 gold를 얻은 뒤 콘텐츠 태그별 분포를 보고 “결정 필요” 지점을 확정한다. 평균만으로 통과시키지 않고, 전체 평균과 최악 케이스를 함께 본다.

| 축 | 지표·공식 | 측정 비용 | v1.0 합격 / 불합격 |
|---|---|---|---|
| STT 정확도 | 한국어는 정규화 후 `CER = edit_distance(ref,hyp)/len(ref)`; 공백/구두점은 별도 제거. 보조로 `WER`와 고유명사 오류율 `NERR = wrong_terms/term_occurrences` | gold transcript 30~50분 | 전체 CER ≤ 8%, p90 케이스 CER ≤ 12%, 고유명사 NERR ≤ 5%. 어느 하나라도 초과하면 불합격 |
| STT 속도 | `RTF_stt = wall_sec / audio_sec`, `throughput = audio_sec / wall_sec`; 모델 다운로드·초기 로드·캐시 warm을 별도 필드 | 자동 | cold p90 RTF ≤ 1.0, warm p90 ≤ 0.6. 기존 2단계 캐시 재출력은 STT 속도와 섞지 않는다 (`docs/FEATURE-STATUS.md:47-50`) |
| VAD 경계 정확도 | gold와 hyp interval의 IoU 매칭. `precision = matched_hyp / hyp`, `recall = matched_gold / gold`, `F1`; 경계 오차 `MAE = mean(|start_err|+|end_err|)/2` | 10개에서 1~2분의 speech/non-speech boundary만 표기 | F1 ≥ 0.90, start/end MAE ≤ 120ms, speech recall ≥ 0.95. 말이 잘리는 케이스는 불합격 blocker |
| VAD 속도 | `RTF_vad = vad_wall_sec / analyzed_audio_sec`, cold/warm 분리 | 자동 | cold p90 RTF ≤ 0.10 또는 현재 baseline 대비 20% 이상 악화 금지 |
| 화자 정확도 | overlap 제외 DER: `DER=(false_alarm+missed_speech+speaker_error)/reference_speech`; overlap은 별도 `overlap_recall`; 화자 ID permutation을 최소화해 매칭 | 10개 중 화자 있는 케이스의 3~5분 gold | DER ≤ 15%, speaker confusion ≤ 10%, p90 DER ≤ 25%. overlap recall은 ≥ 0.70을 목표로 하되 단일 STT 스트림 한계는 별도 표시 (`docs/BACKLOG-v0.14.md:107-111`) |
| 화자 속도 | `RTF_diar = wall_sec / diarized_audio_sec`; 모델 로드와 inference를 분리 | 자동 | cold p90 RTF ≤ 0.25, 전체 분석 시간의 20% 이하. 고정밀이 실패해 baseline으로 내려가면 정확도 수치가 아니라 `fallback_rate`로 불합격 |
| 구두점 정확도 | gold punctuation mark 집합과 hyp mark 집합의 `P=correct/pred`, `R=correct/ref`, `F1`; 문장 끝 종결 부호는 `terminal_accuracy`로 별도 | 각 sample transcript에 사람이 쉼표·마침표만 보정 | mark F1 ≥ 0.85, terminal accuracy ≥ 0.92. 의미를 바꾸는 문장 종결 오류는 케이스별 2건 이하 |

현재 STT는 Qwen3-ASR + ForcedAligner를 기본으로 하고 Whisper를 선택적으로 교차검증하며, Apple SpeechAnalyzer는 macOS 26+ 선택지로 노출된다 (`JobRunner.swift:492-515`). 그러므로 모델 비교는 “같은 VAD 구간, 같은 정규화, 같은 gold, 같은 하드웨어”에서만 한다. 사전에 제시된 93.1%/91.4%, 102x/CER 수치는 이 10개 프로젝트 지표와 정의가 다르면 v1.0 합격 근거로 재사용하지 않는다.

### 1.4 하네스 리포트 스키마와 회귀 게이트

`tools/e2e.py`가 기존 `timings.json`을 없애지 않고 `report.json`을 추가한다. `tools/e2e_report.py`는 현재처럼 외부 리소스 없는 단일 HTML을 만들되, 케이스별 gold 비교와 이전 run diff를 추가한다 (`tools/e2e_report.py:1-14`).

```json
{
  "schema": 1,
  "run": {"run_id":"2026-08-14T...-abc123", "app_git":"...", "engine_git":"...", "hardware":"..."},
  "cases": [{
    "case_id":"p01", "source_sha256":"...", "tags":["interview"],
    "config":{"asr":"Qwen3-ASR-1.7B-8bit", "vad_threshold":0.5, "max_chars":32},
    "stages":{"stt":{"wall_sec":82.1,"rtf":0.31}, "vad":{}, "diarization":{}, "punctuation":{}},
    "metrics":{"stt":{"cer":0.0,"wer":0.0}, "vad":{"f1":0.0}, "diarization":{"der":null}, "punctuation":{"f1":0.0}},
    "natural_breaks":{}, "output":{"subtitles":0,"cuts":0,"fallbacks":[]},
    "status":"pass"
  }],
  "gate":{"passed":false,"failures":[],"baseline_run":"..."}
}
```

회귀 게이트는 (a) blocker 지표 하나라도 임계값 초과, (b) 전체 CER/VAD F1/DER가 baseline 대비 10% 상대 악화, (c) 실패·fallback·출력 FCPXML 검증 오류, (d) cold 속도 p90 20% 악화 중 하나면 실패한다. 데이터가 없는 지표는 0점이 아니라 `null`/`not_measured`로 기록하고, v1.0 release gate에서 허용하지 않는다. baseline은 내일 첫 실행의 성공 여부와 무관하게 보존한다.

## 2. 자막 분리 지점의 자연스러움

현재 엔진은 문장 끝 정규식, 종결어미·절 경계, 최대 글자 수를 기준으로 분할한다 (`silence_cutter/fcpxml.py:64-83`, `78-150`). 하지만 이것은 자연스러움의 대리 규칙이지 측정값이 아니다. 다음 소수 지표로 gold와 직접 비교한다.

### 2.1 계산 가능한 지표

각 hyp 카드 경계를 gold 카드 경계에 시간 허용폭 ±250ms로 매칭하고, gold annotator가 “이 단어 뒤에서 끊어도 자연스러운가”를 0/1/2로 채점한다.

| 지표 | 공식 / 판정 |
|---|---|
| 자연 경계 적중률 (NBR) | `natural_breaks_at_gold / all_breaks`; 어절 내부, 조사와 의존명사 분리, 종결어미 전 분리는 0점. 어절·구·절 경계는 1점, 종결/완결 절은 2점으로 가중 평균 `NBR_w` 계산 |
| pause 정렬 | `pause_alignment = breaks_with_pause_≤300ms / breaks`; 카드 경계 직전의 실제 무음 길이와 gold 경계의 차이 `pause_error_ms`도 기록. 단, pause가 없어도 언어적 완결이면 감점하지 않는다 |
| 읽기 적합성 | 카드별 `CPS = normalized_char_count / (end-start)`; 2줄은 전체 글자/노출시간으로 계산. `CPS 12~17` 비율, `CPS>20` 비율, 노출 0.8초 미만 비율을 기록 |
| 줄 균형 | 2줄 카드에서 `balance = min(line1,line2)/max(line1,line2)`; 평균 ≥0.65, 0.35 미만 카드 ≤5% |
| orphan/widow | 카드 시작/끝에 한 단어만 남은 카드 비율. `orphan_rate = one_word_card_or_tail / all_cards`; 조사·짧은 맞장구 카드는 별도 태그 |
| 길이 위반 | 1줄 max 또는 2줄 max를 넘은 카드 비율. 자연 경계 보존을 위해 soft overrun(최대 +8자)과 hard overrun을 분리한다 (`JobRunner.swift:235-247`의 길이 단계가 제품 목표값임) |

종합 점수는 `0.35*NBR_w + 0.20*pause_score + 0.20*readability + 0.10*balance + 0.10*(1-orphan_rate) + 0.05*(1-hard_overrun_rate)`로 시작한다. **v1.0 목표:** `NBR_w ≥ 0.85`, pause alignment ≥ 0.80, CPS 범위 비율 ≥ 0.90, orphan/widow ≤ 0.05, hard overrun ≤ 0.02. 종합 점수만으로 상쇄하지 못하게 NBR_w와 hard overrun은 blocker로 둔다.

### 2.2 10개 gold set과 A/B 방법

각 프로젝트에서 자동 경계가 많은 구간 10개, 종결어미·조사·쉼이 있는 구간 10개, 긴 발화 5개를 뽑아 최대 25개 카드 경계를 사람이 직접 표시한다. 10개면 최대 250경계로, 전체 자막을 재작성하지 않고도 알고리즘 차이를 잡을 수 있다. 표본이 적으므로 “통계적으로 일반화됐다”고 말하지 않고 `gold_coverage`를 함께 표시한다.

변경마다 같은 `gold_set_v1`에 A(현재 엔진)와 B(후보)를 같은 단어 타임스탬프로 실행한다. 카드 텍스트·시간·모델만 비교하고, annotator는 A/B를 보지 않은 상태에서 gold를 고정한다. paired bootstrap(프로젝트 단위 1,000회)으로 `ΔNBR_w`, `ΔCPS`, `Δorphan_rate`의 95% CI를 계산한다. B는 NBR_w가 ≥3%p 좋아지고, CER/VAD blocker를 악화시키지 않으며, 최악 프로젝트가 5%p 이상 악화되지 않을 때만 채택한다.

## 3. 오늘 스캔 뒤에도 남는 수작업과 제거 순서

현재 앱은 프로젝트 문서에 설정·대본·목차·사전·구두점을 저장하고, 2단계 분석 캐시로 옵션 변경 시 재전사를 피한다 (`docs/FEATURE-STATUS.md:33-50`). 따라서 “기능이 더 많아지는 것”보다 아래 시간 비용을 먼저 줄인다.

| 순위 | 사용자가 하는 일 | 코드 근거와 수정안 | 추정 공수 | 사용자 절약 |
|---:|---|---|---:|---:|
| 1 | 결과를 FCP에 넣은 뒤 잘린 말·나쁜 자막 경계를 찾음 | NBR/VAD gold를 먼저 만들고 경계 점수·CPS 경고를 결과 화면에 표시. 자연 경계 A/B를 엔진 `fcpxml.py` 분할부에 반영 | 3~5일 | 10분 영상당 검수 15~30분 → 3~8분 목표 |
| 2 | 고정밀 화자분리 실패를 모르고 번호를 다시 배정 | Core ML 모델은 번들·manifest·SHA 검증을 쓰지만, 공식 게이트는 아직 OFF다 (`docs/DEV-RECORD-diarization.md:16-21`; `FeatureFlags.swift:9-16`). 실패 코드를 결과 상단에 표시하고, 합격 전에는 화자분리를 숨긴다 | 2~3일 | 화자 있는 10분 영상당 재배정 5~15분 제거 |
| 3 | 긴 분석이 끝나기를 기다리고 설정을 바꿔 재실행 | 기존 cache를 stage별 progress/취소/재개와 결합. `analysisCachePath` 변경 시 대본을 다시 로드하는 연결은 이미 존재한다 (`TranscriptEditorView.swift:447-470`) | 2~4일 | 1회 1~5분, 재출력은 1초 수준 유지 |
| 4 | 모델·언어·길이 옵션의 의미를 추측 | 미사용 도움말 18개를 `help:`에 연결한다 (`docs/BACKLOG-v0.14.md:50-64`). 핵심 옵션만 인라인 설명하고, 고급 옵션은 기본값으로 숨긴다 | 0.5~1일 | 세팅 시행착오 2~5분/프로젝트 |
| 5 | 성공한 작업의 로그와 원인을 찾음 | 로그가 실패 때만 팝오버인 상태다. 메뉴에서 성공/실패·모델·fallback·stage times를 열고 복사하게 한다 (`docs/FEATURE-STATUS.md:93-101`) | 1~2일 | 문제 재현·지원 문의 5~10분 |
| 6 | 화자 이름과 FCP 출력 롤을 다시 고침 | role→name 매핑을 프로젝트 문서·FCP 롤·SRT/Markdown에 관통. 데이터 자리만 있고 출력 경로가 없는 미완료 항목이다 (`docs/BACKLOG-v0.14.md:77-83`) | 3~5일 | 인터뷰당 2~10분 |
| 7 | AI 편집에 “아까 것”을 기대 | 엔진 요청이 독립이고 대화 이력이 없다 (`docs/BACKLOG-v0.14.md:85-92`). v1.0은 멀티턴을 만들지 않고 독립 작업 카드임을 명시한다 | 1일 | 잘못된 기대·재시도 감소. 시간 절약이 검증되지 않으면 멀티턴은 자른다 |

위 표의 1~3위만 해도 $49.99의 체감 가치를 만든다. 화려한 AI 채팅, 새 모델 선택지, 음원 분리는 정확도·시간·수작업을 직접 줄이지 못하면 v1.0 범위에서 자른다. 겹침 2줄은 현재 단일 STT 스트림으로 “두 텍스트가 모두 전사된 경우”에만 가능한 v1 상태이므로 완전한 음원 분리는 v1.1로 미룬다 (`docs/BACKLOG-v0.14.md:107-111`).

## 4. MAS와 웹 직판의 2개 배포판

### 4.1 동일해야 하는 것

분석 결과 JSON 계약, 모델 ID·revision·hash, subtitle split, FCPXML/SRT/Markdown 출력, 프로젝트 문서, cache key, 오류 코드, UI와 기본값은 동일해야 한다. 한 소스에서 `BuildVariant`만 주입하고, 엔진은 `APPSTORE`인지 모르게 한다. 현재 `APPSTORE`는 번들 Python/모듈 경로를, 개발 빌드는 로컬 venv를 선택한다 (`JobRunner.swift:325-376`). 이 경계를 유지한다.

### 4.2 달라야 하는 것

| 항목 | MAS | 웹 직판 |
|---|---|---|
| 샌드박스 | `app-sandbox`, user-selected read/write, network client, Downloads entitlement. 현재 빌드 경로도 이 권한을 생성한다 (`build_app.sh:123-147`; `FCPAutoCut-AppStore.entitlements:5-12`) | Hardened Runtime + Developer ID + notarization. 번들 Python의 `.so` 때문에 library validation/unsigned executable memory 예외가 현재 필요하다 (`FCPAutoCut-Hardened.entitlements:5-12`). 심사 전 최소 권한 재검토 |
| 결제 | StoreKit 2 product/verified transaction만 PRO 진실의 원천. receipt/transaction 복원, 환불·취소 반영, 오프라인 grace period를 테스트 | 외부 결제 제공자 license token + 서명된 entitlement, 기기 수/오프라인 정책, 환불 webhook. 앱 안에서 MAS용 외부 결제 링크나 구매 유도 금지 |
| 트라이얼 | App Store 규칙과 상품 메타데이터에 맞는 무료 10회/PRO 영구 SKU. 사용량은 현재 정식 빌드 Keychain, 베타 UserDefaults 구조다 (`LicenseManager.swift:19-27`, `79-96`) | 무료 10회 또는 기간 trial을 명시. 서버 없이도 서명 검증 가능한 license와 clock rollback 방어. 베타 30회는 고객 SKU로 재사용하지 않음 |
| 업데이트 | App Store 자동 업데이트와 기존 bundle ID 유지 | Sparkle 또는 서명된 DMG/PKG의 단일 업데이트 경로, Developer ID 서명·공증·staple 확인 |
| 화자분리 | Core ML 모델을 번들해 네트워크·토큰 없이 제공할 때만 FeatureFlag 해제. 현재 공식 비베타는 `FeatureFlags.diarization=false` | 같은 모델·같은 조건. 직판만 기능을 더 주면 품질 측정이 갈라지므로 금지 |
| 가격/번들 | $49.99 영구 PRO 하나를 우선. 구독·외부 번들 라이선스는 심사·지원 복잡도를 늘리므로 v1.0 제외 | 같은 체감 가격. 외부 결제는 단독 라이선스 또는 명시된 번들 계약만. MAS 구매자에게 웹 할인/외부 링크를 보여주지 않음 |

심사 지뢰는 (1) MAS 앱 안의 외부 결제 URL/구매 버튼, (2) MAS 영수증을 자체 license로 대체, (3) 샌드박스 앱이 사용자 선택 없이 임의 경로를 읽는 것, (4) MAS에만 없는 모델을 조용히 다운로드하는 것, (5) 같은 bundle ID의 직판 앱으로 키체인·업데이트를 충돌시키는 것이다. 직판 bundle ID와 Keychain service를 명시적으로 분리하되, 프로젝트 문서와 사용자 데이터는 migration으로 공유할지 **결정 필요**다.

### 4.3 SKU별 출시 체크리스트

**공통**

- [ ] 10개 프로젝트 회귀 gate pass: STT/VAD/화자/구두점/NBR, cold/warm 속도, 최악 케이스 기록
- [ ] 성공·fallback·모델 hash·stage timing이 로그와 리포트에 남음
- [ ] FCPXML DTD/프레임 정렬/재임포트/재개/취소/깨진 media 링크 테스트
- [ ] 앱과 번들 엔진의 commit·버전·schema가 일치
- [ ] 개인정보: 미디어·대본이 외부로 나가지 않음을 기본값으로 확인

**MAS `APPSTORE && !BETA`**

- [ ] `FeatureFlags.diarization`가 의도대로 OFF인지, UI·엔진 모두 `--no-diarize`인지 확인; 해제할 경우 모델 라이선스/번들/해시/심사 설명까지 먼저 승인
- [ ] App Sandbox entitlement와 provision profile이 실제 서명에 들어감; nested Python/ffmpeg/Mach-O inside-out 서명
- [ ] `codesign --verify --deep --strict`, sandbox, `PrivacyInfo.xcprivacy`, `get-task-allow` 부재 확인 (`build_app.sh:171-180`)
- [ ] StoreKit sandbox에서 구매·복원·환불·오프라인 재시작·10회 소진 테스트
- [ ] App Store metadata에 Final Cut Pro 호환을 사실대로 표시하고 Apple 상표/외부 결제 유도 문구 제거
- [ ] `.pkg` 업로드, 설치 후 실제 FCPXML 3건 재검증

**웹 직판 `APPSTORE` 미정의 + `BETA` 미정의(정식 직판)**

- [ ] Developer ID Application 서명, hardened runtime, notarization/staple, 새 Mac Gatekeeper 설치
- [ ] license 발급·서명·검증·환불/해지·기기 변경·시계 조작 테스트
- [ ] 자동 업데이트가 이전 사용자 데이터와 cache를 보존하고, 이전 버전 rollback이 안전함
- [ ] MAS 전용 StoreKit 코드와 직판 license 코드를 공통 `Entitlement` 프로토콜 뒤에 둠
- [ ] 화자분리는 MAS와 동일 gate/모델/문서로 배포; “웹판만 더 좋다”는 출시 문구 금지

## 5. 우선순위와 일정

| 시점 | 작업 | 종료 기준 | 가장 위험한 가정 |
|---|---|---|---|
| 내일 오전 | 10개 manifest 고정, cold 기준 run, 출력·timings·gold sample 생성 | 10/10 입력이 읽히고 `report.json`과 raw artifacts가 보존됨 | 10개가 현재 미디어 링크와 재현 가능하다 |
| 내일 오후 | STT/VAD/화자/구두점 gold 라벨, 25개×10 자연 경계 gold | 각 gold에 audio offset·annotator·schema가 있고 20% 재검수 완료 | 30~50분의 라벨링으로 대표 구간을 덮는다 |
| 1주차 | e2e schema·HTML diff·threshold gate, baseline 확정 | 같은 run 재현, 실패 시 exit non-zero, 이전 run과 자동 비교 | 현재 하네스 출력만으로 stage별 시간이 충분히 분리된다 |
| 2주차 | 자연 경계 A/B와 결과 화면의 품질 경고, 기존 split 회귀 | NBR_w ≥.85, CPS ≥.90, hard overrun ≤.02 및 기존 STT/VAD gate 유지 | 언어 규칙 개선이 STT 텍스트 자체를 악화시키지 않는다 |
| 2주차 | 캐시/취소/재개·로그·도움말의 값싼 완성도 | 재출력은 재전사하지 않고, 실패 원인과 fallback이 사용자에게 보임 | 모든 실패가 구조화 이벤트로 올라온다 |
| 3주차 | 화자분리 배포 계약과 고정밀 실콘텐츠 검증, 이름 매핑 | 화자 gate 통과 또는 공식 기능 숨김이 명확하고 조용한 fallback 0건 | 93.1% 결과가 다양한 콘텐츠에도 유지된다 |
| 3~4주차 | MAS/직판 빌드 분리, StoreKit/license, 서명·공증·샌드박스 | SKU 체크리스트 전체 pass, TestFlight/직판 새 Mac 설치 후 3개 프로젝트 성공 | 번들 Python/ffmpeg가 두 서명 정책에서 모두 실행된다 |
| 4주차 | release candidate와 지원 문서 | 10개 전체 gate를 RC commit에서 재실행하고 blocker 0, 사용자 승인 완료 | gold set이 실제 고객 편집 시간을 예측한다 |

단계가 종료 기준을 못 맞추면 새 기능을 추가하지 않고 원인·측정 공백을 문서화한다. 특히 화자분리의 공식 게이트 해제는 정확도뿐 아니라 다른 Mac의 번들 실행, 모델 라이선스 고지, 실패 표시까지 한 번에 통과해야 한다. 현재 개발 기록도 넓은 콘텐츠 정답 커버리지와 실전 겹침 검증을 공식 출시 전 남은 일로 둔다 (`docs/DEV-RECORD-diarization.md:47-58`).

## 사용자만 내릴 수 있는 결정

- [ ] 10개 프로젝트와 오디오를 v1.0 gold 평가 자산으로 장기 보관할 것인가.
- [ ] 화자분리를 MAS/직판 v1.0에 포함할 것인가, 공식 버전에서 계속 숨길 것인가.
- [ ] MAS와 직판의 프로젝트·모델 cache를 공유할 것인가.
- [ ] $49.99를 단일 영구 PRO SKU로 고정할 것인가.
- [ ] 자연 경계·읽기 속도 gate를 만족하지 못하면 출시를 미루고, AI 채팅·新모델·겹침 v2를 자를 것인가.
