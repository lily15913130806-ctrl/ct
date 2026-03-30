/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  BookOpen, 
  Plus, 
  Trash2, 
  Printer, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Upload, 
  X,
  RefreshCw,
  FileText,
  Save,
  Volume2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { cn } from "./lib/utils";
import { Question, SimilarQuestion, OCRResult } from "./types";
import { identifyWrongQuestion, generateSimilarQuestions } from "./services/geminiService";

// --- Components ---

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-3 z-50">
    <button 
      onClick={() => setActiveTab("identify")}
      className={cn(
        "flex flex-col items-center gap-1 transition-colors",
        activeTab === "identify" ? "text-blue-600" : "text-gray-400"
      )}
    >
      <Camera size={24} />
      <span className="text-xs font-medium">错题识别</span>
    </button>
    <button 
      onClick={() => setActiveTab("notebook")}
      className={cn(
        "flex flex-col items-center gap-1 transition-colors",
        activeTab === "notebook" ? "text-blue-600" : "text-gray-400"
      )}
    >
      <BookOpen size={24} />
      <span className="text-xs font-medium">错题本</span>
    </button>
  </div>
);

const LoadingOverlay = ({ message }: { message: string }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[100] text-white">
    <Loader2 className="animate-spin mb-4" size={48} />
    <p className="text-lg font-medium">{message}</p>
  </div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState("identify");
  const [records, setRecords] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  
  // Identification State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [similarQuestions, setSimilarQuestions] = useState<SimilarQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Selection for PDF
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingRecord, setViewingRecord] = useState<Question | null>(null);

  // Load records from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("wrong_questions");
    if (saved) {
      try {
        setRecords(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved records", e);
      }
    }
  }, []);

  // Save records to localStorage
  const saveRecords = (newRecords: Question[]) => {
    setRecords(newRecords);
    localStorage.setItem("wrong_questions", JSON.stringify(newRecords));
  };

  const handleSpeak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      window.speechSynthesis.speak(utterance);
    } else {
      alert("您的浏览器不支持语音播放。");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setSelectedImage(base64);
      setOcrResult(null);
      setSimilarQuestions([]);
      
      setIsLoading(true);
      setLoadingMessage("正在识别错题内容...");
      try {
        const result = await identifyWrongQuestion(base64);
        setOcrResult(result);
      } catch (error) {
        console.error("OCR failed", error);
        alert("识别失败，请重试或手动输入。");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateSimilar = async () => {
    if (!ocrResult) return;
    
    setIsGenerating(true);
    setLoadingMessage("正在生成举一反三变式题...");
    try {
      const questions = await generateSimilarQuestions(ocrResult.problem, ocrResult.knowledgePoint);
      setSimilarQuestions(questions);
    } catch (error) {
      console.error("Generation failed", error);
      alert("生成变式题失败，请重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToNotebook = () => {
    if (!ocrResult || similarQuestions.length === 0) return;

    const newRecord: Question = {
      id: crypto.randomUUID(),
      problem: ocrResult.problem,
      options: ocrResult.options,
      userAnswer: ocrResult.userAnswer,
      standardAnswer: ocrResult.standardAnswer,
      knowledgePoint: ocrResult.knowledgePoint,
      similarQuestions: similarQuestions,
      createdAt: Date.now(),
    };

    saveRecords([newRecord, ...records]);
    alert("已保存到错题本！");
    setActiveTab("notebook");
    
    // Reset identify state
    setSelectedImage(null);
    setOcrResult(null);
    setSimilarQuestions([]);
  };

  const handleDeleteRecord = (id: string) => {
    if (confirm("确定要删除这条记录吗？")) {
      const newRecords = records.filter(r => r.id !== id);
      saveRecords(newRecords);
      const newSelected = new Set(selectedIds);
      newSelected.delete(id);
      setSelectedIds(newSelected);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handlePrint = async () => {
    if (selectedIds.size === 0) {
      alert("请先选择要打印的错题。");
      return;
    }

    setIsLoading(true);
    setLoadingMessage("正在生成 PDF 文件...");

    try {
      const selectedRecords = records.filter(r => selectedIds.has(r.id));
      
      // Create a hidden container for PDF content
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "800px"; // Fixed width for consistent layout
      container.className = "bg-white p-10 space-y-10 font-sans";
      
      const title = document.createElement("h1");
      title.className = "text-3xl font-bold text-center mb-10";
      title.innerText = "错题举一反三练习册";
      container.appendChild(title);

      selectedRecords.forEach((record, index) => {
        const section = document.createElement("div");
        section.className = "space-y-4 border-b border-gray-200 pb-10";
        
        section.innerHTML = `
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold text-blue-600">知识点：${record.knowledgePoint}</h2>
            <span class="text-sm text-gray-400">${new Date(record.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="space-y-2">
            <h3 class="font-bold text-gray-900 underline">【原错题】</h3>
            <p class="text-lg leading-relaxed">${record.problem}</p>
            ${record.options && record.options.length > 0 ? `
              <div class="ml-4 space-y-1">
                ${record.options.map(opt => `<p class="text-sm">• ${opt}</p>`).join("")}
              </div>
            ` : ""}
            <div class="flex gap-10 mt-2 text-sm text-gray-500 italic">
              <p>你的回答：${record.userAnswer || "无"}</p>
              <p>标准答案：${record.standardAnswer || "无"}</p>
            </div>
          </div>
          <div class="space-y-6 mt-6">
            <h3 class="font-bold text-gray-900 underline">【举一反三变式题】</h3>
            ${record.similarQuestions.map((sq, i) => `
              <div class="space-y-2 bg-gray-50 p-4 rounded-lg">
                <p class="font-bold text-blue-600">变式题 ${i + 1}</p>
                <p class="text-base">${sq.problem}</p>
                <div class="pt-2 border-t border-gray-200">
                  <p class="text-sm font-bold text-green-600">答案：${sq.answer}</p>
                  <p class="text-sm text-red-600 mt-1"><strong>易错点分析：</strong>${sq.analysis}</p>
                </div>
              </div>
            `).join("")}
          </div>
        `;
        container.appendChild(section);
      });

      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF("p", "mm", "a4");
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Handle multi-page
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`错题集_${new Date().toLocaleDateString()}.pdf`);
      document.body.removeChild(container);
    } catch (error) {
      console.error("PDF generation failed", error);
      alert("生成 PDF 失败，请重试。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900">
      {isLoading && <LoadingOverlay message={loadingMessage} />}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-40">
        <h1 className="text-xl font-bold text-center text-blue-600">错题举一反三打印机</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "identify" ? (
            <motion.div
              key="identify"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Upload Area */}
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-8 flex flex-col items-center justify-center gap-4 relative overflow-hidden group hover:border-blue-400 transition-colors">
                {selectedImage ? (
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                    <img src={selectedImage} alt="Selected" className="w-full h-full object-contain" />
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                      <Upload size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">点击或拖拽上传错题图片</p>
                      <p className="text-sm text-gray-500 mt-1">支持 JPG, PNG 格式</p>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </>
                )}
              </div>

              {/* OCR Result */}
              {ocrResult && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <CheckCircle2 className="text-green-500" size={20} />
                      识别结果
                    </h2>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSpeak(ocrResult.problem)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="语音朗读"
                      >
                        <Volume2 size={20} />
                      </button>
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full font-medium">
                        {ocrResult.knowledgePoint}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">题目内容</label>
                      <textarea 
                        value={ocrResult.problem}
                        onChange={(e) => setOcrResult({ ...ocrResult, problem: e.target.value })}
                        className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[100px]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">你的回答</label>
                        <input 
                          type="text"
                          value={ocrResult.userAnswer || ""}
                          onChange={(e) => setOcrResult({ ...ocrResult, userAnswer: e.target.value })}
                          className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">标准答案</label>
                        <input 
                          type="text"
                          value={ocrResult.standardAnswer || ""}
                          onChange={(e) => setOcrResult({ ...ocrResult, standardAnswer: e.target.value })}
                          className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">核心知识点</label>
                      <input 
                        type="text"
                        value={ocrResult.knowledgePoint}
                        onChange={(e) => setOcrResult({ ...ocrResult, knowledgePoint: e.target.value })}
                        className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleGenerateSimilar}
                    disabled={isGenerating}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="animate-spin" /> : <RefreshCw size={20} />}
                    生成举一反三变式题
                  </button>
                </motion.div>
              )}

              {/* Similar Questions */}
              {similarQuestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <h2 className="text-lg font-bold px-2">举一反三变式题</h2>
                  {similarQuestions.map((q, idx) => (
                    <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
                      <div className="flex items-center gap-2 text-blue-600 font-bold">
                        <span className="w-6 h-6 bg-blue-50 rounded-full flex items-center justify-center text-xs">{idx + 1}</span>
                        变式题
                      </div>
                      <div className="text-sm leading-relaxed">
                        <ReactMarkdown>{q.problem}</ReactMarkdown>
                      </div>
                      <div className="pt-3 border-t border-gray-100 space-y-2">
                        <p className="text-sm font-medium text-green-600">答案：{q.answer}</p>
                        <div className="bg-red-50 p-3 rounded-lg">
                          <p className="text-xs font-bold text-red-600 uppercase mb-1">易错点分析</p>
                          <p className="text-sm text-red-700">{q.analysis}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-4">
                    <button 
                      onClick={handleGenerateSimilar}
                      className="flex-1 bg-white text-blue-600 border border-blue-600 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
                    >
                      <RefreshCw size={20} />
                      重新生成
                    </button>
                    <button 
                      onClick={handleSaveToNotebook}
                      className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
                    >
                      <Save size={20} />
                      保存到错题本
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="notebook"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Notebook Header */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-blue-600" />
                  <span className="font-bold">已保存 {records.length} 条记录</span>
                </div>
                <div className="flex gap-2">
                  {selectedIds.size > 0 && (
                    <button 
                      onClick={handlePrint}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors"
                    >
                      <Printer size={16} />
                      打印 ({selectedIds.size})
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (selectedIds.size === records.length) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(records.map(r => r.id)));
                      }
                    }}
                    className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                  >
                    {selectedIds.size === records.length ? "取消全选" : "全选"}
                  </button>
                </div>
              </div>

              {/* Records List */}
              <div className="space-y-4">
                {records.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                    <FileText size={48} className="mx-auto mb-4 opacity-20" />
                    <p>错题本空空如也，快去识别错题吧</p>
                  </div>
                ) : (
                  records.map((record) => (
                    <div 
                      key={record.id}
                      className={cn(
                        "bg-white rounded-2xl shadow-sm border transition-all overflow-hidden",
                        selectedIds.has(record.id) ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"
                      )}
                    >
                      <div className="p-4 flex items-start gap-3">
                        <button 
                          onClick={() => toggleSelection(record.id)}
                          className={cn(
                            "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                            selectedIds.has(record.id) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"
                          )}
                        >
                          {selectedIds.has(record.id) && <CheckCircle2 size={16} />}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">
                              {record.knowledgePoint}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(record.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm font-medium line-clamp-2 text-gray-700">
                            {record.problem}
                          </p>
                        </div>

                        <button 
                          onClick={() => handleDeleteRecord(record.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Expandable Detail (Simplified for list) */}
                      <div className="bg-gray-50 px-4 py-2 flex justify-between items-center text-xs text-gray-500 border-t border-gray-100">
                        <span>包含 {record.similarQuestions.length} 道变式题</span>
                        <button 
                          onClick={() => setViewingRecord(record)}
                          className="text-blue-600 font-bold flex items-center gap-1"
                        >
                          查看详情 <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Detail Modal */}
              <AnimatePresence>
                {viewingRecord && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] p-4 flex items-center justify-center"
                    onClick={() => setViewingRecord(null)}
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.9, y: 20 }}
                      className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-6"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between sticky top-0 bg-white pb-4 border-b border-gray-100 z-10">
                        <h2 className="text-xl font-bold">错题详情</h2>
                        <button onClick={() => setViewingRecord(null)} className="p-2 hover:bg-gray-100 rounded-full">
                          <X size={24} />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-blue-50 p-4 rounded-2xl">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-blue-600 uppercase">原错题</span>
                            <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full">{viewingRecord.knowledgePoint}</span>
                          </div>
                          <p className="text-sm leading-relaxed text-gray-800">{viewingRecord.problem}</p>
                          {viewingRecord.options && viewingRecord.options.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {viewingRecord.options.map((opt, i) => (
                                <p key={i} className="text-xs text-gray-600">• {opt}</p>
                              ))}
                            </div>
                          )}
                          <div className="mt-4 pt-4 border-t border-blue-100 grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-bold text-blue-400 uppercase">你的回答</p>
                              <p className="text-sm font-medium">{viewingRecord.userAnswer || "无"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-blue-400 uppercase">标准答案</p>
                              <p className="text-sm font-medium text-green-600">{viewingRecord.standardAnswer || "无"}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="font-bold text-gray-900">举一反三变式题</h3>
                          {viewingRecord.similarQuestions.map((sq, i) => (
                            <div key={sq.id} className="border border-gray-200 rounded-2xl p-4 space-y-2">
                              <p className="text-sm font-bold text-blue-600">变式题 {i + 1}</p>
                              <div className="text-sm text-gray-700">
                                <ReactMarkdown>{sq.problem}</ReactMarkdown>
                              </div>
                              <div className="pt-2 border-t border-gray-50">
                                <p className="text-xs font-bold text-green-600">答案：{sq.answer}</p>
                                <div className="mt-2 bg-red-50 p-3 rounded-xl">
                                  <p className="text-[10px] font-bold text-red-600 uppercase mb-1">易错点分析</p>
                                  <p className="text-xs text-red-700">{sq.analysis}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
