# 57~79회 기출 데이터

- `data/exams/{회차}.json`: 50문항, 배점, 공식 정답, 원문 이미지와 보기.
- `data/explanations/{회차}.json`: 직접 작성한 핵심 정리와 보기별 학습 해설. 공식 정답표에는 해설이 없으므로 공식 해설로 표시하지 않는다.
- `data/exam_catalog.js`: 회차 선택 화면과 저장된 풀이의 점수 계산에 쓰는 배점 목록.
- `data/sources.json`: 사용자가 제공한 PDF 이름과 SHA-256. 73회 중복 정답표의 일치도 확인했다.
- `assets/exams/{회차}/`: 원문에서 추출한 WebP. 원본 PDF는 저장소에 포함하지 않는다.

80회의 기존 JS 데이터와 `khistory80_mvp_v1` 저장 키는 유지한다. 추가 회차는 `khistory{회차}_mvp_v1`에 개별 저장한다. 회차 데이터·해설은 해당 회차를 열 때 불러온다.

## 추출과 검수

1. 로컬 `tmp/pdfs/manifest.json`에 PDF의 `name`, `path`, `pages`, `chars`, `sha256`을 기록한다. `tmp/`는 Git에서 제외한다.
2. `python -X utf8 scripts/import_exams.py prepare`로 페이지와 PDF 텍스트를 준비한다. `pypdfium2`, Pillow가 필요하다.
3. 이미지 PDF는 Windows PowerShell 5.1에서 `scripts/ocr-pages.ps1 -InputDirectory <tmp/pdfs 절대 경로>`로 오프라인 OCR을 수행한다. OCR은 영역 탐색 보조용이다. 스캔된 문제의 보기 문구는 OCR 결과 대신 원문 이미지를 표시한다.
4. `python -X utf8 scripts/import_exams.py extract --rounds=57-69`와 `export --rounds=57-69`로 데이터를 만든다. `exam_geometry.json`은 직접 확인한 예외 영역·제목·선택지를 보정한다. 57~69회의 스캔 보기 좌표는 option_markers로 보존한다. 57회 35·36번, 61회 29·30번, 62회 49·50번, 63회 47·48번, 66회 30·31번, 67회 47·48번, 69회 47·48번, 72회 47·48번은 공통 사료를 함께 제공한다.
5. 해설은 원문·공식 정답을 읽고 작성한다. `author_explanations.py`는 50줄의 `핵심 정리|보기1|보기2|보기3|보기4|보기5` 입력을 JSON으로 옮기는 도구이며 해설을 추론하지 않는다.

검증 명령:

```text
python -X utf8 scripts/verify_exams.py
node scripts/test_study.cjs
```

첫 검증은 로컬 원본 정답 PDF가 필요하며, 1,150문항의 정답·배점·이미지·해설 완전성을 검사한다. 두 번째는 실제 앱 스크립트를 격리된 메모리 저장소에서 실행해 채점·재풀이·오답·북마크·회차별 기록·불완전 데이터 차단을 검사한다. 사용자의 실제 학습 기록을 변경하지 않는다.

자동 검사와 별개로 원문 대비 자료·보기 잘림, 이미지 확대, iPad 가로형 55:45 배치, 새로고침 시 회차 선택 홈 표시를 브라우저에서 확인한다. 정답표 대조는 해설 문장 자체의 역사적 정확성을 보증하는 검사가 아니므로 해설은 별도로 검토해야 한다.

63회 42번은 사용자가 제공한 공식 정정 정답표에 따라 `correct_option: null`, `accept_all: true`로 저장한다. 제출한 보기에 관계없이 2점을 인정하고 공식 정정 안내를 표시하며, 특정 보기를 정답으로 강조하지 않는다. 통합 테스트는 다섯 보기를 모두 검증한다.
