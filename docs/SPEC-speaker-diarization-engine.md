# TypeCut Pro 화자 분리 엔진 v2 구현 스펙

> Claude 구현 전달용 — 2026-08-10
>
> 목표: Hugging Face 토큰이나 런타임 네트워크 없이, Apple Silicon의 Core ML 가속을 활용하는 고정밀 화자 분리를 현재 Python STT 파이프라인에 연결한다.

## 1. 확정 결정

### 백엔드

| 모드 | 구현 | 네트워크 | 목적 |
|---|---|---:|---|
| 기본 | 현재 `resemblyzer + SpectralClustering` CPU | 불필요 | 항상 동작하는 안정적 기준선 |
| 고정밀 | FluidAudio Offline Core ML 우선 검토·구현 | 실행 중 불필요 | Apple GPU/ANE 기반 정밀 분리·겹침 감지 |
| 비교 후보 | WeSpeaker Core ML | 실행 중 불필요 | FluidAudio와 정확도·속도·메모리 비교 |
| 비활성 | `--no-diarize` | 불필요 | 화자분리 없이 STT만 실행 |

고정밀 모드에는 다음을 사용하지 않는다.

- Hugging Face 토큰, Hugging Face 모델 런타임, pyannote Python 파이프라인
- 분석 중 모델 다운로드나 외부 API 호출
- 사용자 계정·약관 동의가 필요한 원격 모델

모델은 앱 번들에 포함하거나, 별도 모델 설치 단계에서 한 번 다운로드한다. 설치 후에는 네트워크를 차단해도 동일하게 실행되어야 한다.

### 제품 범위

- v2는 “누가 말했는가”를 `SPEAKER_0`, `SPEAKER_1`처럼 구분한다. 실명 식별과 음성 프로필 등록은 범위 밖이다.
- 화자 ID는 **원본 미디어 파일별 로컬 ID**다. 서로 다른 파일의 `SPEAKER_0`을 같은 사람으로 간주하지 않는다.
- 화자분리 실패는 전체 작업 실패가 아니다. 해당 소스만 화자 정보 없이 계속 처리한다.
- 한 자막 블록 안에 여러 화자의 단어를 섞지 않는다.

## 2. 현재 코드와 수정 대상

엔진 저장소:

```text
~/Movies/Subtitle Automation/Silence-Cutter/
```

주요 대상:

```text
silence_cutter/diarize.py   현재 baseline 및 새 Core ML adapter
silence_cutter/engine.py    미디어별 실행·캐시·단어 매칭
silence_cutter/__main__.py  CLI 옵션
silence_cutter/tests/       엔진 회귀 테스트
```

앱 저장소:

```text
Sources/FCPAutoCut/JobRunner.swift
Sources/FCPAutoCut/TranscriptEditorView.swift
Sources/FCPAutoCut/TranscriptModels.swift
Tests/FCPAutoCutTests/
```

소스 수정은 구현 담당 Claude의 worktree에서 한다. main worktree의 `Sources/`를 직접 수정하지 않는다.

## 3. 입력·출력 계약

### 입력

각 미디어 단위로 다음을 사용한다.

```text
media_key       정규화된 미디어 경로 또는 안정적인 콘텐츠 해시
wav_path        16 kHz mono PCM WAV
file_start      원본 파일 좌표 시작(초)
file_end        원본 파일 좌표 종료(초)
words[]         { id, start, end, text } — 원본 파일 좌표
speaker_count   auto 또는 2..4
backend         baseline | high_precision_coreml
```

규칙:

- 모든 시간은 초 단위 실수이며 `start < end`를 만족한다.
- STT 단어 시간은 diarization 창 시간으로 덮어쓰지 않는다.
- 같은 미디어가 여러 클립에서 사용되면 diarization은 `media_key`별 1회만 실행하고, 각 클립의 `file_start/file_end`로 결과를 잘라 쓴다.
- 스테레오/다채널은 mono로 다운믹스하고, 16 kHz 변환은 한 경로에서만 수행한다.

### 내부 결과

```json
{
  "schema_version": 2,
  "media_key": "sha256:…",
  "backend": "high_precision_coreml",
  "model_id": "fluidaudio-diarizer-<revision>",
  "speaker_count": 2,
  "segments": [
    {
      "start": 12.25,
      "end": 15.50,
      "speaker_id": 0,
      "confidence": null
    }
  ],
  "overlap_segments": [],
  "warnings": [],
  "duration_sec": 3600.0
}
```

- confidence를 실제로 산출하지 못하면 `null`로 둔다. 임의의 95% 점수를 만들지 않는다.
- `segments`는 시간순으로 정렬하고, 각 구간은 `start < end`여야 한다.
- ID는 **미디어 전체 기준**으로 `0..N-1`로 정규화한다. 순서는 발화량 내림차순,
  동률이면 최초 등장 시각, 그래도 같으면 라벨 문자열 — 같은 미디어를 다시 돌려도
  같은 번호가 나와야 한다. 파일 외부의 동일 인물을 뜻하지는 않는다.
- **개정(2026-08-10)** — `--start/--end`로 응답을 자르면 화자가 통째로 빠져 번호에
  구멍이 생길 수 있다. 그때 **다시 매기지 않는다** — 다시 매기면 같은 사람이 창마다
  다른 번호를 받아 §1의 "미디어 파일별 로컬 ID"가 깨진다. 대신
  `warnings`에 `speaker_ids_not_contiguous_after_clipping`을 넣고,
  응답에 다음 두 필드를 함께 싣는다:
  - `speaker_ids` — 이 응답에 실제로 등장하는 번호 목록
  - `total_speaker_count` — 미디어 전체 화자 수(번호 공간의 크기)

  소비자는 `range(speaker_count)`가 아니라 `speaker_ids`를 써야 한다.
- Core ML 백엔드가 겹침 구간을 반환하면 `overlap_segments`에 보존한다.

## 4. 화자 매칭 규칙

단어 `[word.start, word.end)`마다 다음을 적용한다.

1. 모든 diarization 구간과의 양의 교집합 시간을 계산한다.
2. 교집합이 가장 긴 화자를 선택한다.
3. 동률이면 단어 중심에 가까운 구간, 그래도 같으면 낮은 `speaker_id`를 선택한다.
4. 교집합이 없으면 단어 중심에 가장 가까운 구간을 선택한다.
5. ~~가장 가까운 구간과의 거리가 `0.75초`를 초과하거나 결과가 비어 있으면 `speaker_id = null`로 둔다.~~
   **개정(2026-08-10, 구현 중 결정)** — diarization 결과가 **비어 있을 때만** `null`이다.
   거리 초과로는 `null`을 두지 않고 가장 가까운 화자에 붙인다.

   이유: 미배정 단어는 FCP에서 화자 롤이 없어 기본 롤로 나가고, 그러면 **화자가
   2명인데 자막 색이 3개**가 된다. 이미 한 번 고쳤던 회귀다. 무음 한가운데 떨어진
   단어를 가장 가까운 화자에 붙이는 쪽이 화면상 해가 없다. 되돌리려면 먼저
   "미배정 화자 롤"을 색 체계에 정식으로 넣어야 한다.
   구현: `silence_cutter/diarize.py`의 `assign_speaker`.

6. 동률 처리는 결정론이어야 한다 — 교집합이 같으면 단어 중심에 가까운 구간, 그래도
   같으면 낮은 `speaker_id`. (입력 순서에 따라 결과가 달라지면 안 된다.)

자막 규칙:

- 화자 변경은 자막 분할의 하드 경계다.
- 앞뒤 턴이 같은 화자일 때만 고립된 1단어 턴을 흡수한다. 짧은 맞장구를 길이만으로 삭제하지 않는다.
- 미배정(`null`)은 diarization 결과가 **비어 있을 때만** 생긴다(§4.5 개정). 그때는
  화자 구분 자체가 없으므로 전체가 기본 Role로 나가고, 색이 하나뿐이라 혼동이 없다.
- 화자 색상은 텍스트에 삽입하지 않고 `speaker_id → role/name/color` 매핑으로 처리한다.

## 5. Core ML 고정밀 구현 요구사항

### 5.1 Adapter 설계

기존 `diarize_audio()` 호출부가 backend를 선택하도록 한다.

```python
diarize_audio(
    wav_path,
    file_start=0.0,
    file_end=None,
    num_speakers=None,
    backend="baseline",  # baseline | coreml
    log=None,
)
```

Core ML adapter는 다음을 보장한다.

- FluidAudio의 offline diarizer API와 모델을 우선 조사한다.
- API가 현재 런타임과 호환되지 않으면 WeSpeaker Core ML 모델을 동일 adapter 계약에 연결한다.
- 모델 로딩 후 `MLModel`의 실제 compute unit과 모델 revision을 로그에 기록한다.
- Apple Silicon에서는 `.all` 또는 프로젝트가 정한 GPU/ANE 설정을 사용하고, Intel에서는 baseline으로 폴백한다.
- 모델 파일은 manifest의 SHA-256과 일치할 때만 로드한다.
- 모델 로딩·추론 중 네트워크 접근을 하지 않는다.
- Swift 네이티브 도입이 필요하더라도 Python 엔진의 기존 출력 계약은 유지한다.

### 5.2 모델 설치

모델 manifest는 다음 정보를 가진다.

```json
{
  "model_id": "fluidaudio-diarizer-1",
  "revision": "<immutable revision>",
  "files": [
    { "path": "Diarizer.mlmodelc", "sha256": "…", "license": "…" }
  ],
  "source_url": "…",
  "offline_ready": true
}
```

- 모델 설치는 분석과 분리한다.
- 설치 완료 전에는 고정밀 분석을 시작하지 않는다.
- 설치 실패 시 baseline으로 진행할지 사용자에게 선택지를 제공하되, 기본값은 작업 완주다.
- 모델 파일·manifest·라이선스 고지문은 앱 지원 폴더 또는 번들에 함께 보관한다.
- 각 릴리스에 모델 출처, revision, hash, 라이선스를 기록한다.

### 5.3 겹침 발화

- 고정밀 백엔드가 겹침을 감지하면 진단 결과에는 모든 화자를 보존한다.
- 일반 자막 출력은 `exclusive` 또는 지배적 화자 하나를 사용한다.
- v2는 음성 분리 파일을 생성하지 않는다.
- 겹침 발화가 별도 자막으로 출력되는 경우에도 하나의 자막에 두 화자를 합치지 않는다.

## 6. 오류·폴백·캐시

오류 분류:

```text
model_missing       모델 미설치
model_hash_mismatch 모델 검증 실패
coreml_unavailable  Core ML/기기 미지원
inference_failed    추론 실패
invalid_output      출력 스키마 위반
```

처리 규칙:

- `high_precision_coreml` 실패 시 해당 미디어만 baseline으로 재실행한다.
- baseline도 실패하면 STT 자막은 화자 정보 없이 계속 생성한다.
- 로그에 `diarization_fallback` 이벤트를 남기고, 토큰·비밀번호·전체 원본 경로는 기록하지 않는다.
- 캐시 키는 다음을 모두 포함한다.

```text
media_key + backend + model_id + model_revision + model_hash + sample_rate
```

- 모델 revision/hash가 바뀌면 캐시를 재사용하지 않는다.
- 취소·실패·성공 모든 경로에서 임시 WAV와 자식 프로세스를 정리한다.
- 부분 결과를 성공 결과로 표시하지 않는다.

## 7. CLI·앱 연동

CLI:

```text
--no-diarize
--num-speakers auto|2|3|4
--diarize-hq                 Core ML 고정밀 요청
--diarize-backend baseline|coreml
--analysis-cache <path>
```

구조화 로그(JSONL):

```json
{"event":"diarization_started","media_key":"sha256:…","backend":"coreml","model_id":"fluidaudio-diarizer-1"}
{"event":"diarization_finished","media_key":"sha256:…","speaker_count":2,"segments":18,"duration_sec":42.1}
{"event":"diarization_fallback","media_key":"sha256:…","from":"coreml","to":"baseline","reason":"model_missing"}
```

Swift 요구사항:

- `JobRunner`는 diarization을 별도 단계로 표시한다.
- 진행률은 로그 문자열이 아니라 구조화 이벤트를 기준으로 갱신한다.
- UI 모델은 `speakerID`, `sourceKey`, `displayName`, `roleName`, `color`를 분리한다.
- 이름 변경은 문자열 치환이 아니라 `speakerID` 매핑으로 전체 재출력에 적용한다.
- 색상 외에도 번호·이름·VoiceOver 라벨로 화자를 구분한다.
- 모델 설치 상태, 모델 revision, offline-ready 상태를 사용자에게 표시한다.

## 8. 테스트 및 검증

### 자동 테스트

최소 다음을 추가한다.

- 교집합이 긴 화자 선택
- 동률·가장 가까운 구간의 결정론적 처리 (§4.5 개정으로 0.75초 제한은 없다 —
  대신 **입력 순서를 바꿔도 같은 결과**가 나오는지 검증한다)
- 화자 번호 안정성: 같은 미디어를 다시 돌려도 같은 번호. 창을 잘라도 번호가 안 바뀐다
- **네트워크를 차단한 상태에서 고정밀 분석 완주** (§10 완료 정의의 직접 검증)
- 화자 경계에서 자막 하드 분할
- 1단어 턴 흡수의 양성·음성 케이스
- 같은 미디어의 중복 실행 방지
- 서로 다른 미디어의 speaker ID 격리
- Core ML 모델 누락/해시 오류/추론 오류의 baseline 폴백
- 비어 있는 diarization 결과에서도 STT 출력 성공
- 모델 revision/hash 변경 시 캐시 무효화
- 이름 변경이 동일한 텍스트를 가진 다른 화자에 영향을 주지 않음
- 취소 후 임시 파일·자식 프로세스 정리

### 골든셋

1인 독백, 2인 순차 대화, 3~4인 패널, 짧은 맞장구, 겹침 발화, 배경음, 긴 무음, 다중 미디어, 한국어·영어 혼합을 포함한다.

기록할 지표:

```text
DER / JER
speaker confusion rate
word speaker accuracy
overlap recall
STT WER/CER 회귀
real-time factor = 처리시간 / 오디오 길이
peak RSS
fallback rate
```

“95%+”와 “1시간/1분”은 샘플·기기·모델 revision·캐시 상태 없이 주장하지 않는다.

최소 실행:

```bash
swift build
swift test

# 엔진 저장소
python -m pytest silence_cutter/tests/test_diarize_*.py \
  silence_cutter/tests/test_speaker_runs.py

# 동일 콘텐츠 대조
python -m silence_cutter resub SAMPLE.fcpxml --no-diarize
python -m silence_cutter resub SAMPLE.fcpxml --diarize-backend baseline
python -m silence_cutter resub SAMPLE.fcpxml --diarize-backend coreml
```

각 실행에 앱 버전, 엔진 커밋, 모델 revision/hash, macOS, 칩, 입력 길이, 캐시 여부, 결과·로그 경로를 남긴다.

## 9. Claude 구현 순서

1. 현재 baseline의 입출력과 단어-화자 매칭을 위 계약에 맞춰 테스트로 고정한다.
2. `backend=baseline|coreml` adapter와 구조화 오류 이벤트를 추가한다.
3. FluidAudio Offline Core ML API·모델·라이선스·Swift/Python 호출 가능성을 확인한다.
4. FluidAudio가 막히면 WeSpeaker Core ML을 같은 adapter 계약으로 연결한다. HF/pyannote로 우회하지 않는다.
5. 모델 manifest·hash 검증·설치 상태·오프라인 실행을 구현한다.
6. 미디어별 캐시·폴백·취소 정리를 구현한다.
7. `JobRunner`와 UI의 모델 상태·화자 이름·Role·접근성을 연결한다.
8. baseline/Core ML을 골든셋으로 비교하고 결과를 `docs/`에 기록한다.
9. `swift build`, `swift test`, 엔진 테스트, 대표 콘텐츠 실측을 모두 통과시킨 뒤 완료 보고한다.

## 10. 완료 정의

- 고정밀 모드가 HF 토큰 없이 실행된다.
- 모델 설치 후 네트워크를 차단해도 고정밀 분석이 완주한다.
- FluidAudio 또는 WeSpeaker Core ML 중 실제 채택 백엔드와 모델 revision/hash가 기록된다.
- 기본·고정밀·비활성화 모드가 결정론적으로 동작한다.
- 고정밀 실패 시 baseline, baseline 실패 시 무화자 STT로 단계적으로 완주한다.
- 다중 미디어의 화자 결과가 섞이지 않는다.
- 한 자막에 여러 화자가 섞이지 않는다.
- 모델·코드·가중치의 상업적 재배포 라이선스와 고지문이 승인된다.
- 자동 테스트, Swift 테스트, 골든셋 실측 결과가 기록된다.

