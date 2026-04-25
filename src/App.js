import React, { useRef, useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { db } from "./firebase";
import { ref, set, onValue, push } from "firebase/database";
import jsPDF from "jspdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function makeRoomId() {
  return Math.random().toString(36).substring(2, 9);
}

export default function App() {
  const canvasRef = useRef(null);
  const selectionRef = useRef(null);

  const [pdfFile, setPdfFile] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [role, setRole] = useState("teacher");
  const [roomId, setRoomId] = useState("");
  const [isEraser, setIsEraser] = useState(false);

  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [redoStack, setRedoStack] = useState([]);

  // 문제 저장 기능
  const [problemTitle, setProblemTitle] = useState("");
  const [savedProblems, setSavedProblems] = useState([]);
  const [selectedProblemIds, setSelectedProblemIds] = useState([]);

  // 영역 선택 기능
  const [selectMode, setSelectMode] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");

    if (roomFromUrl) {
      setRoomId(roomFromUrl);
    } else {
      const newRoomId = makeRoomId();
      setRoomId(newRoomId);
      window.history.replaceState(null, "", `?room=${newRoomId}`);
    }
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setPdfFile(file);
    setPageNumber(1);
    setStrokes([]);
    setRedoStack([]);
    setSelection(null);
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const getColor = () => {
    return role === "teacher" ? "red" : "blue";
  };

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const normalizeSelection = (start, end) => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    return { x, y, width, height };
  };

  const drawStroke = (ctx, stroke) => {
    if (!stroke || stroke.points.length < 2) return;

    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = stroke.type === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const redrawCanvas = (nextStrokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    nextStrokes.forEach((stroke) => drawStroke(ctx, stroke));
  };

  const saveStrokesToFirebase = (nextStrokes, nextRedoStack = redoStack) => {
    if (!roomId) return;
    set(ref(db, `rooms/${roomId}/page-${pageNumber}`), {
      strokes: nextStrokes,
      redoStack: nextRedoStack,
    });
  };

  useEffect(() => {
    if (!roomId || !canvasRef.current) return;

    const pageRef = ref(db, `rooms/${roomId}/page-${pageNumber}`);

    const unsubscribe = onValue(pageRef, (snapshot) => {
      const data = snapshot.val() || {};
      const nextStrokes = data.strokes || [];
      const nextRedoStack = data.redoStack || [];

      setStrokes(nextStrokes);
      setRedoStack(nextRedoStack);
      redrawCanvas(nextStrokes);
    });

    return () => unsubscribe();
  }, [roomId, pageNumber]);

  useEffect(() => {
    if (!roomId) return;

    const problemsRef = ref(db, `rooms/${roomId}/savedProblems`);

    const unsubscribe = onValue(problemsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const problems = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
      }));

      setSavedProblems(problems.reverse());
    });

    return () => unsubscribe();
  }, [roomId]);

  const goPrevPage = () => {
    setSelection(null);
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const goNextPage = () => {
    setSelection(null);
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  };

  const createNewRoom = () => {
    const newRoomId = makeRoomId();
    setRoomId(newRoomId);
    setPageNumber(1);
    setStrokes([]);
    setRedoStack([]);
    setSavedProblems([]);
    setSelection(null);
    window.history.replaceState(null, "", `?room=${newRoomId}`);
  };

  const copyRoomLink = async () => {
    const link = window.location.href;
    await navigator.clipboard.writeText(link);
    alert("수업 링크가 복사됐어요!");
  };

  const undo = () => {
    if (strokes.length === 0) return;

    const lastStroke = strokes[strokes.length - 1];
    const nextStrokes = strokes.slice(0, -1);
    const nextRedoStack = [...redoStack, lastStroke];

    setStrokes(nextStrokes);
    setRedoStack(nextRedoStack);
    redrawCanvas(nextStrokes);
    saveStrokesToFirebase(nextStrokes, nextRedoStack);
  };

  const redo = () => {
    if (redoStack.length === 0) return;

    const strokeToRestore = redoStack[redoStack.length - 1];
    const nextRedoStack = redoStack.slice(0, -1);
    const nextStrokes = [...strokes, strokeToRestore];

    setStrokes(nextStrokes);
    setRedoStack(nextRedoStack);
    redrawCanvas(nextStrokes);
    saveStrokesToFirebase(nextStrokes, nextRedoStack);
  };

  const clearAllStrokes = () => {
    const nextRedoStack = [...redoStack, ...strokes];

    setStrokes([]);
    setRedoStack(nextRedoStack);
    redrawCanvas([]);
    saveStrokesToFirebase([], nextRedoStack);
  };

  const saveProblem = async () => {
    if (!roomId) return;

    const title = problemTitle.trim() || `페이지 ${pageNumber} 저장 문제`;
    const newProblemRef = push(ref(db, `rooms/${roomId}/savedProblems`));

    await set(newProblemRef, {
      title,
      pageNumber,
      strokes,
      selection: null,
      imageData: null,
      createdAt: Date.now(),
    });

    setProblemTitle("");
    alert("현재 페이지 문제가 저장됐어요!");
  };

  const saveSelectedProblem = async () => {
    if (!roomId || !selection) {
      alert("먼저 저장할 문제 영역을 드래그해서 선택해줘!");
      return;
    }

    if (selection.width < 10 || selection.height < 10) {
      alert("선택 영역이 너무 작아요. 다시 선택해줘!");
      return;
    }

    const title = problemTitle.trim() || `페이지 ${pageNumber} 선택 문제`;
    const canvas = canvasRef.current;

    // PDF 캔버스 찾기: react-pdf가 만든 실제 페이지 canvas
    const pdfCanvas = canvas.parentElement.querySelector(".react-pdf__Page__canvas");

    const mergedCanvas = document.createElement("canvas");
    mergedCanvas.width = canvas.width;
    mergedCanvas.height = canvas.height;
    const mergedCtx = mergedCanvas.getContext("2d");

    if (pdfCanvas) {
      mergedCtx.drawImage(pdfCanvas, 0, 0, canvas.width, canvas.height);
    }

    // 필기 캔버스 합치기
    mergedCtx.drawImage(canvas, 0, 0);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = selection.width;
    cropCanvas.height = selection.height;
    const cropCtx = cropCanvas.getContext("2d");

    cropCtx.drawImage(
      mergedCanvas,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height
    );

    const imageData = cropCanvas.toDataURL("image/png");

    const selectedStrokes = strokes.filter((stroke) =>
      stroke.points.some(
        (point) =>
          point.x >= selection.x &&
          point.x <= selection.x + selection.width &&
          point.y >= selection.y &&
          point.y <= selection.y + selection.height
      )
    );

    const newProblemRef = push(ref(db, `rooms/${roomId}/savedProblems`));

    await set(newProblemRef, {
      title,
      pageNumber,
      strokes: selectedStrokes,
      selection,
      imageData,
      createdAt: Date.now(),
    });

    setProblemTitle("");
    alert("선택한 문제 영역이 저장됐어요!");
  };

  const loadProblem = (problem) => {
    setPageNumber(problem.pageNumber);

    const nextStrokes = problem.strokes || [];
    const nextRedoStack = [];

    setTimeout(() => {
      setStrokes(nextStrokes);
      setRedoStack(nextRedoStack);
      redrawCanvas(nextStrokes);
      saveStrokesToFirebase(nextStrokes, nextRedoStack);
    }, 100);
  };

  const toggleProblemSelection = (problemId) => {
    setSelectedProblemIds((prev) =>
      prev.includes(problemId)
        ? prev.filter((id) => id !== problemId)
        : [...prev, problemId]
    );
  };

  const selectAllProblems = () => {
    const imageProblemIds = savedProblems
      .filter((problem) => problem.imageData)
      .map((problem) => problem.id);

    setSelectedProblemIds(imageProblemIds);
  };

  const clearProblemSelection = () => {
    setSelectedProblemIds([]);
  };

  const exportProblemsToPDF = async () => {
    const problemsWithImages = savedProblems.filter(
      (problem) => problem.imageData && selectedProblemIds.includes(problem.id)
    );

    if (problemsWithImages.length === 0) {
      alert("PDF로 내보낼 문제를 체크해줘!");
      return;
    }

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - 35;

    for (let i = 0; i < problemsWithImages.length; i++) {
      const problem = problemsWithImages[i];

      if (i > 0) pdf.addPage();

      pdf.setFontSize(14);
      pdf.text(`${i + 1}. ${problem.title}`, margin, 15);

      pdf.setFontSize(10);
      pdf.text(`페이지 ${problem.pageNumber}`, margin, 22);

      const img = new Image();
      img.src = problem.imageData;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
      const imgWidth = img.width * ratio;
      const imgHeight = img.height * ratio;

      pdf.addImage(problem.imageData, "PNG", margin, 30, imgWidth, imgHeight);
    }

    pdf.save("homework-problems.pdf");
  };

  const startDrawing = (e) => {
    const point = getCanvasPoint(e);

    if (selectMode) {
      setSelecting(true);
      setSelectionStart(point);
      setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }

    const newStroke = {
      type: isEraser ? "eraser" : "pen",
      color: isEraser ? "rgba(0,0,0,1)" : getColor(),
      width: isEraser ? 20 : 2,
      role,
      points: [point],
    };

    setCurrentStroke(newStroke);
    setDrawing(true);
  };

  const draw = (e) => {
    const point = getCanvasPoint(e);

    if (selectMode && selecting && selectionStart) {
      setSelection(normalizeSelection(selectionStart, point));
      return;
    }

    if (!drawing || !currentStroke) return;

    const updatedStroke = {
      ...currentStroke,
      points: [...currentStroke.points, point],
    };

    setCurrentStroke(updatedStroke);
    redrawCanvas([...strokes, updatedStroke]);
  };

  const stopDrawing = () => {
    if (selectMode) {
      setSelecting(false);
      return;
    }

    if (!drawing || !currentStroke) return;

    const nextStrokes = [...strokes, currentStroke];
    const nextRedoStack = [];

    setStrokes(nextStrokes);
    setRedoStack(nextRedoStack);
    saveStrokesToFirebase(nextStrokes, nextRedoStack);

    setCurrentStroke(null);
    setDrawing(false);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>실시간 PDF Whiteboard + 화상 수업</h2>

      <div
        style={{
          padding: "12px",
          border: "1px solid #ddd",
          marginBottom: "15px",
          width: "fit-content",
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          <strong>현재 수업방:</strong> {roomId}
        </div>

        <button onClick={copyRoomLink}>수업 링크 복사</button>
        <button onClick={createNewRoom} style={{ marginLeft: "10px" }}>
          새 수업방 만들기
        </button>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <button onClick={() => { setRole("teacher"); setIsEraser(false); setSelectMode(false); }}>
          선생
        </button>
        <button
          onClick={() => { setRole("student"); setIsEraser(false); setSelectMode(false); }}
          style={{ marginLeft: "10px" }}
        >
          학생
        </button>

        <button
          onClick={() => { setIsEraser((prev) => !prev); setSelectMode(false); }}
          style={{ marginLeft: "15px" }}
        >
          {isEraser ? "펜으로 바꾸기" : "지우개"}
        </button>

        <button
          onClick={() => { setSelectMode((prev) => !prev); setIsEraser(false); }}
          style={{ marginLeft: "15px" }}
        >
          {selectMode ? "영역 선택 끄기" : "문제 영역 선택"}
        </button>

        <button onClick={undo} disabled={strokes.length === 0} style={{ marginLeft: "15px" }}>
          되돌리기
        </button>

        <button onClick={redo} disabled={redoStack.length === 0} style={{ marginLeft: "10px" }}>
          다시 실행
        </button>

        <button onClick={clearAllStrokes} disabled={strokes.length === 0} style={{ marginLeft: "10px" }}>
          전체 필기 지우기
        </button>

        <span style={{ marginLeft: "15px" }}>
          현재: {selectMode
            ? "문제 영역 선택"
            : isEraser
            ? "지우개"
            : role === "teacher"
            ? "선생(빨강)"
            : "학생(파랑)"}
        </span>
      </div>

      <input type="file" accept="application/pdf" onChange={handleFileChange} />

      {pdfFile && (
        <div style={{ marginTop: "15px", marginBottom: "15px" }}>
          <button onClick={goPrevPage} disabled={pageNumber <= 1}>
            이전 페이지
          </button>

          <span style={{ margin: "0 15px" }}>
            {pageNumber} / {numPages}
          </span>

          <button onClick={goNextPage} disabled={pageNumber >= numPages}>
            다음 페이지
          </button>
        </div>
      )}

      <div style={{ marginBottom: "15px" }}>
        <input
          value={problemTitle}
          onChange={(e) => setProblemTitle(e.target.value)}
          placeholder="저장할 문제 이름 입력 예: 2026 수능 21번"
          style={{ width: "300px", padding: "6px" }}
        />
        <button onClick={saveProblem} style={{ marginLeft: "10px" }}>
          현재 페이지 저장
        </button>
        <button onClick={saveSelectedProblem} style={{ marginLeft: "10px" }}>
          선택 영역 저장
        </button>
      </div>

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        <div
          style={{
            position: "relative",
            width: "600px",
            minHeight: "800px",
            border: "1px solid #ddd",
          }}
        >
          {pdfFile && (
            <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
              <Page pageNumber={pageNumber} width={600} />
            </Document>
          )}

          <canvas
            ref={canvasRef}
            width={600}
            height={800}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 10,
              cursor: selectMode ? "crosshair" : isEraser ? "cell" : "crosshair",
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />

          {selection && (
            <div
              ref={selectionRef}
              style={{
                position: "absolute",
                left: `${selection.x}px`,
                top: `${selection.y}px`,
                width: `${selection.width}px`,
                height: `${selection.height}px`,
                border: "2px dashed orange",
                background: "rgba(255, 165, 0, 0.12)",
                zIndex: 20,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div style={{ width: "400px" }}>
          <iframe
            title="video-call"
            src={`https://meet.jit.si/pdf-whiteboard-${roomId}`}
            allow="camera; microphone; fullscreen; display-capture"
            style={{
              width: "400px",
              height: "420px",
              border: "1px solid #ddd",
            }}
          />

          <div
            style={{
              marginTop: "15px",
              padding: "12px",
              border: "1px solid #ddd",
              height: "340px",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ marginTop: 0 }}>저장한 문제</h3>
              <div>
                <button onClick={selectAllProblems}>전체 선택</button>
                <button onClick={clearProblemSelection} style={{ marginLeft: "6px" }}>
                  선택 해제
                </button>
                <button onClick={exportProblemsToPDF} style={{ marginLeft: "6px" }}>
                  선택한 문제 PDF
                </button>
              </div>
            </div>

            {savedProblems.length === 0 && <p>아직 저장한 문제가 없어요.</p>}

            {savedProblems.map((problem) => (
              <div
                key={problem.id}
                style={{
                  borderBottom: "1px solid #eee",
                  padding: "8px 0",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={selectedProblemIds.includes(problem.id)}
                    onChange={() => toggleProblemSelection(problem.id)}
                    disabled={!problem.imageData}
                  />
                  <strong>{problem.title}</strong>
                </label>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  페이지 {problem.pageNumber}
                  {problem.selection ? " · 선택 영역" : " · 전체 페이지"}
                </div>

                {problem.imageData && (
                  <img
                    src={problem.imageData}
                    alt={problem.title}
                    style={{
                      width: "100%",
                      marginTop: "8px",
                      border: "1px solid #eee",
                    }}
                  />
                )}

                <button onClick={() => loadProblem(problem)} style={{ marginTop: "6px" }}>
                  불러오기
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


