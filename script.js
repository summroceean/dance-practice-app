// ⚠️ 여기에 본인의 Google Apps Script 웹 앱 배포 URL을 넣어주세요!
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx1qbzvPiz_ib0igmsJP_WTlHn19_Tes3yN8i-S3CsNFAZpnArvAwgoCZMT4CZs0KyD/exec";

const refVideoFile = document.getElementById('ref-video-file');
const userVideoFile = document.getElementById('user-video-file');
const refVideo = document.getElementById('ref-video');
const userVideo = document.getElementById('user-video');
const analyzeBtn = document.getElementById('analyze-btn');
const resultBox = document.getElementById('result-box');

const savePanel = document.getElementById('save-panel');
const groupNameInput = document.getElementById('group-name-input');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

let currentScore = null; // 계산된 최신 점수를 저장할 변수

// 파일 업로드 시 비디오 미리보기 연결
refVideoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) refVideo.src = URL.createObjectURL(file);
});

userVideoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) userVideo.src = URL.createObjectURL(file);
});

// 코사인 유사도 계산 함수
function calculateCosineSimilarity(vectorA, vectorB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
        normA += vectorA[i] * vectorA[i];
        normB += vectorB[i] * vectorB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 1. 유사도 분석 버튼 클릭
analyzeBtn.addEventListener('click', async () => {
    if (!refVideo.src || !userVideo.src) {
        alert("원본 영상과 내 연습 영상 파일을 모두 업로드해주세요!");
        return;
    }

    resultBox.innerText = "AI 모델 로딩 중...";
    analyzeBtn.disabled = true;
    savePanel.style.display = "none";
    saveStatus.innerText = "";

    try {
        const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
        const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);

        resultBox.innerText = "영상을 분석하는 중입니다...";

        refVideo.currentTime = 0;
        userVideo.currentTime = 0;
        
        await refVideo.play();
        await userVideo.play();
        refVideo.pause();
        userVideo.pause();

        const refPose = await detector.estimatePoses(refVideo);
        const userPose = await detector.estimatePoses(userVideo);

        if (refPose.length > 0 && userPose.length > 0) {
            let refVector = refPose[0].keypoints.flatMap(kp => [kp.x, kp.y]);
            let userVector = userPose[0].keypoints.flatMap(kp => [kp.x, kp.y]);

            let similarity = calculateCosineSimilarity(refVector, userVector);
            currentScore = Math.max(0, Math.min(100, Math.round(similarity * 100)));
            
            resultBox.innerText = `분석 완료! 유사도 점수: ${currentScore}점`;
            
            // 점수가 정상 계산되면 저장 패널 표시
            savePanel.style.display = "block";
        } else {
            resultBox.innerText = "영상의 인물을 감지하지 못했습니다. 다시 시도해 주세요.";
        }

    } catch (error) {
        console.error(error);
        resultBox.innerText = "분석 중 오류가 발생했습니다.";
    } finally {
        analyzeBtn.disabled = false;
    }
});

// 2. 구글 스프레드시트 저장 버튼 클릭
saveBtn.addEventListener('click', async () => {
    const groupName = groupNameInput.value.trim();

    if (!groupName) {
        alert("곡(무리) 이름을 입력해주세요! (예: 뉴진스 - 슈퍼샤이)");
        return;
    }

    if (currentScore === null) {
        alert("먼저 유사도 분석을 완료해주세요.");
        return;
    }

    saveBtn.disabled = true;
    saveStatus.innerText = "구글 스프레드시트에 저장 중...";

    try {
        // CORS 우회를 위해 text/plain으로 JSON 문자열 전송
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({
                groupName: groupName,
                score: currentScore
            })
        });

        saveStatus.innerText = `✅ '${groupName}' (${currentScore}점) 저장 완료!`;
    } catch (error) {
        console.error("저장 오류:", error);
        saveStatus.innerText = "❌ 저장 중 오류가 발생했습니다. URL을 확인해주세요.";
    } finally {
        saveBtn.disabled = false;
    }
});