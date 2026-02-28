
import React, { useState, useEffect } from 'react';
import { geminiService } from './services/geminiService';
import { Session, ContentResult, ProcessingStatus, SUPPORTED_LANGUAGES } from './types';
import { Card } from './components/Layout';

// Cập nhật lên 60.000 ký tự theo yêu cầu
const CHUNK_SIZE = 60000;

const ExpandableContent: React.FC<{ 
  children: React.ReactNode, 
  title: string, 
  icon: string, 
  badgeColor: string, 
  onCopy: () => void,
  className?: string,
  isCode?: boolean
}> = ({ children, title, icon, badgeColor, onCopy, className = "", isCode = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className={`bg-white p-8 rounded-3xl shadow-sm border border-slate-100 transition-all ${className}`}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black flex items-center gap-3">
          <span className={`w-8 h-8 ${badgeColor} rounded-lg flex items-center justify-center text-sm italic font-mono`}>{icon}</span>
          {title}
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-all"
          >
            {isExpanded ? '🔼 Thu gọn' : '🔽 Xem chi tiết'}
          </button>
          <button onClick={onCopy} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all">📋 Copy</button>
        </div>
      </div>
      
      <div className={`relative transition-all duration-300 ${!isExpanded ? 'max-h-[3.5rem] overflow-hidden' : 'max-h-[5000px]'}`}>
        <div className={`${!isExpanded ? 'line-clamp-2' : ''} ${isCode ? 'font-mono text-sm' : ''}`}>
          {children}
        </div>
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
        )}
      </div>
    </section>
  );
};

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [targetLang, setTargetLang] = useState('Tiếng Anh');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  const [processingSessionIds, setProcessingSessionIds] = useState<Set<string>>(new Set());
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, ProcessingStatus>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const activeStatus = activeSessionId ? sessionStatuses[activeSessionId] || ProcessingStatus.IDLE : ProcessingStatus.IDLE;
  const activeError = activeSessionId ? errors[activeSessionId] || null : null;

  useEffect(() => {
    const saved = localStorage.getItem('athSessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0 || localStorage.getItem('athSessions')) {
      localStorage.setItem('athSessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const handleNewSession = () => {
    setActiveSessionId(null);
    setInputText('');
  };

  const selectSession = (session: Session) => {
    setActiveSessionId(session.id);
    setInputText(session.inputText);
  };

  const updateSessionData = (sessionId: string, partialData: Partial<ContentResult>) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        const newData = s.data ? { ...s.data, ...partialData } : { ...partialData, timestamp: Date.now(), targetLanguage: targetLang } as ContentResult;
        return { ...s, data: newData };
      }
      return s;
    }));
  };

  const setSessionStatus = (sessionId: string, status: ProcessingStatus) => {
    setSessionStatuses(prev => ({ ...prev, [sessionId]: status }));
  };

  const setSessionError = (sessionId: string, error: string | null) => {
    setErrors(prev => ({ ...prev, [sessionId]: error }));
  };

  const splitIntoChunks = (text: string, size: number): string[] => {
    const chunks: string[] = [];
    let currentPos = 0;
    
    while (currentPos < text.length) {
      if (currentPos + size >= text.length) {
        chunks.push(text.substring(currentPos).trim());
        break;
      }

      let endPos = currentPos + size;
      
      // Tìm dấu kết thúc câu (. ! ? hoặc xuống dòng) gần với vị trí size nhất
      // Ưu tiên tìm ngược lại từ vị trí size để đảm bảo không vượt quá size quá nhiều
      const subText = text.substring(currentPos, endPos + 500); // Cho phép tìm quá tay một chút để tìm dấu câu
      const regex = /[.!?](\s|\n|$)/g;
      let lastMatch = -1;
      let match;
      
      while ((match = regex.exec(subText)) !== null) {
        if (match.index > size * 0.8) { // Chỉ lấy các dấu câu nằm ở 20% cuối của chunk để tối ưu độ dài
           lastMatch = match.index + 1; // +1 để bao gồm cả dấu chấm
        }
        if (match.index > size) break;
      }

      if (lastMatch !== -1) {
        endPos = currentPos + lastMatch;
      } else {
        // Nếu không tìm thấy dấu câu lý tưởng, tìm dấu xuống dòng
        const lastNewline = text.lastIndexOf('\n', endPos);
        if (lastNewline > currentPos + (size * 0.7)) {
          endPos = lastNewline + 1;
        }
      }

      chunks.push(text.substring(currentPos, endPos).trim());
      currentPos = endPos;
    }
    return chunks.filter(c => c.length > 0);
  };

  const createNewSession = (text: string) => {
    const id = Date.now().toString();
    const newSession: Session = {
      id,
      name: text.length > 30 ? text.substring(0, 30) + "..." : text || `Phiên ${new Date().toLocaleTimeString('vi-VN')}`,
      createdAt: Date.now(),
      data: null,
      inputText: text
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(id);
    return id;
  };

  const handleProcess = async () => {
    const textToProcess = inputText.trim();
    if (!textToProcess) return;

    let sessionId = activeSessionId;
    if (!sessionId || (activeSession && activeSession.data && activeSession.data.seoTags)) {
      sessionId = createNewSession(textToProcess);
    }

    if (processingSessionIds.has(sessionId)) return;

    setProcessingSessionIds(prev => new Set(prev).add(sessionId!));
    setSessionError(sessionId!, null);

    const currentLang = targetLang;

    try {
      updateSessionData(sessionId!, { targetLanguage: currentLang, translatedText: [] });

      setSessionStatus(sessionId!, ProcessingStatus.STEP_TRANSLATING);
      const textChunks = splitIntoChunks(textToProcess, CHUNK_SIZE);
      const translatedChunks: string[] = [];

      for (let i = 0; i < textChunks.length; i++) {
        const translatedPart = await geminiService.translate(
          textChunks[i], 
          currentLang,
          i + 1,
          textChunks.length
        );
        translatedChunks.push(translatedPart);
        updateSessionData(sessionId!, { translatedText: [...translatedChunks] });
      }

      const fullTranslation = translatedChunks.join('\n\n');
      
      setSessionStatus(sessionId!, ProcessingStatus.STEP_PROMPTS);
      const prompts = await geminiService.generateImagePrompts(fullTranslation);
      updateSessionData(sessionId!, { imagePrompts: prompts });
      
      setSessionStatus(sessionId!, ProcessingStatus.STEP_DESCRIPTION);
      const description = await geminiService.generateYouTubeDescription(fullTranslation, currentLang);
      updateSessionData(sessionId!, { youtubeDescription: description });
      
      setSessionStatus(sessionId!, ProcessingStatus.STEP_TAGS);
      const tags = await geminiService.generateSEOTags(fullTranslation, currentLang);
      updateSessionData(sessionId!, { seoTags: tags });

      setSessionStatus(sessionId!, ProcessingStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setSessionError(sessionId!, err.message || 'Lỗi xử lý nội dung. Vui lòng kiểm tra lại API Key trong cài đặt.');
      setSessionStatus(sessionId!, ProcessingStatus.ERROR);
    } finally {
      setProcessingSessionIds(prev => {
        const next = new Set(prev);
        next.delete(sessionId!);
        return next;
      });
    }
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Xóa phiên này?")) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) handleNewSession();
    }
  };

  const renameSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    const newName = window.prompt("Nhập tên mới cho phiên:", session.name);
    if (newName && newName.trim()) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName.trim() } : s));
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    alert("Đã sao chép!");
  };

  const isProcessing = activeSessionId ? processingSessionIds.has(activeSessionId) : false;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 bg-slate-900 text-white flex flex-col shrink-0 border-r border-slate-800">
        <div className="p-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="bg-blue-600 p-1 rounded shadow-lg shadow-blue-900/20">📂</span> Lịch Sử Phiên
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
          <button 
            onClick={handleNewSession}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold transition-all mb-4 text-center shadow-lg active:scale-95"
          >
            + Phiên Mới
          </button>
          
          <div className="space-y-2">
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => selectSession(session)}
                className={`group relative p-4 rounded-xl cursor-pointer transition-all border ${activeSessionId === session.id ? 'bg-blue-600/20 border-blue-500 shadow-sm' : 'bg-slate-800/50 border-transparent hover:bg-slate-800'}`}
              >
                <div className="pr-10">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate text-sm">{session.name}</p>
                    {processingSessionIds.has(session.id) && (
                        <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse ring-4 ring-blue-500/20"></span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                    {new Date(session.createdAt).toLocaleTimeString('vi-VN')} • {new Date(session.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => renameSession(session.id, e)} className="p-1 hover:text-blue-400 text-sm">✏️</button>
                  <button onClick={(e) => deleteSession(session.id, e)} className="p-1 hover:text-red-400 text-sm">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-12 px-6">
          <div className="mb-10 text-center sm:text-left">
            <h1 className="text-4xl font-black text-blue-600 tracking-tight italic">ATH - CONTENT GEN</h1>
            <p className="text-slate-500 mt-2 font-medium uppercase text-xs tracking-[0.2em]">xử lý nội dung lớn chuyên nghiệp</p>
          </div>

          <Card className="mb-8 border-none shadow-xl shadow-slate-200/50 relative">
            <div className="relative">
              <textarea
                className="w-full h-56 p-5 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none text-slate-700 leading-relaxed text-lg disabled:opacity-70"
                placeholder="Dán văn bản nội dung cần xử lý vào đây (Không giới hạn độ dài)..."
                value={inputText}
                disabled={isProcessing}
                onChange={(e) => setInputText(e.target.value)}
              />
              <div className="absolute bottom-4 right-4 text-[10px] font-bold text-slate-400 bg-white/50 px-2 py-1 rounded">
                {inputText.length.toLocaleString()} ký tự
              </div>
            </div>
            
            <div className="mt-8 flex flex-col sm:flex-row gap-6 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-widest ml-1">Ngôn ngữ mục tiêu</label>
                <select
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm disabled:opacity-50"
                  value={targetLang}
                  disabled={isProcessing}
                  onChange={(e) => setTargetLang(e.target.value)}
                >
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.name}>{lang.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleProcess}
                disabled={isProcessing || !inputText.trim()}
                className={`w-full sm:w-auto px-10 py-4 rounded-xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95
                  ${isProcessing ? 'bg-slate-400 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'}`}
              >
                {isProcessing ? <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : '🚀 BẮT ĐẦU TẠO'}
              </button>
            </div>
          </Card>

          {isProcessing && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-2xl shadow-2xl shadow-blue-500/20 mb-10 text-white animate-fadeIn">
              <div className="flex justify-between items-center mb-5">
                <div className="space-y-1">
                  <h3 className="font-black text-lg uppercase tracking-wider italic">Đang xử lý...</h3>
                  <p className="text-blue-100 font-medium text-sm">
                    {activeStatus === ProcessingStatus.STEP_TRANSLATING && `Đang dịch thuật đoạn ${activeSession?.data?.translatedText?.length || 0 + 1}...`}
                    {activeStatus === ProcessingStatus.STEP_PROMPTS && 'Đang phân tích 30 Image Prompts nghệ thuật...'}
                    {activeStatus === ProcessingStatus.STEP_DESCRIPTION && 'Đang xây dựng nội dung mô tả YouTube...'}
                    {activeStatus === ProcessingStatus.STEP_TAGS && 'Đang tối ưu hóa hệ thống SEO Tags...'}
                  </p>
                </div>
                <div className="bg-white/20 p-3 rounded-full">
                  <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeLinecap="round"/></svg>
                </div>
              </div>
              <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden">
                <div className="bg-white h-full transition-all duration-700" style={{ width: activeStatus === ProcessingStatus.STEP_TRANSLATING ? '25%' : activeStatus === ProcessingStatus.STEP_PROMPTS ? '50%' : activeStatus === ProcessingStatus.STEP_DESCRIPTION ? '75%' : '95%' }} />
              </div>
            </div>
          )}

          {activeError && <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-5 rounded-r-xl mb-10 animate-shake"><p className="font-semibold text-sm">{activeError}</p></div>}

          {activeSession?.data && (
            <div className="space-y-12 animate-fadeIn pb-20">
              {activeSession.data.translatedText && activeSession.data.translatedText.length > 0 && (
                <ExpandableContent 
                  title={`Bản Dịch (${activeSession.data.targetLanguage})`}
                  icon="01"
                  badgeColor="bg-blue-100 text-blue-600"
                  onCopy={() => copyToClipboard(activeSession.data!.translatedText!.join('\n\n'))}
                >
                  <div className="space-y-6">
                    {activeSession.data.translatedText.map((chunk, idx) => (
                      <div key={idx} className="relative group">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Đoạn {idx + 1} ({chunk.length.toLocaleString()} ký tự)</span>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-100">
                          {chunk}
                        </div>
                      </div>
                    ))}
                  </div>
                </ExpandableContent>
              )}

              {activeSession.data.imagePrompts && (
                <ExpandableContent 
                  title="30 Prompt Hình Ảnh"
                  icon="02"
                  badgeColor="bg-indigo-100 text-indigo-600"
                  onCopy={() => copyToClipboard(activeSession.data!.imagePrompts!)}
                  isCode={true}
                >
                  <div className="bg-indigo-50/30 p-6 rounded-2xl text-slate-700 leading-relaxed whitespace-pre-wrap border border-indigo-100 italic">
                    {activeSession.data.imagePrompts}
                  </div>
                </ExpandableContent>
              )}

              {activeSession.data.youtubeDescription && (
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-fadeIn">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                      <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center text-sm italic font-mono">03</span>
                      Mô Tả YouTube
                    </h2>
                    <button onClick={() => copyToClipboard(activeSession.data!.youtubeDescription!)} className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-all">📋 Copy</button>
                  </div>
                  <div className="bg-emerald-50/30 p-6 rounded-2xl text-slate-700 leading-relaxed whitespace-pre-wrap border border-emerald-100 custom-scrollbar">
                    {activeSession.data.youtubeDescription}
                  </div>
                </section>
              )}

              {activeSession.data.seoTags && (
                <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-fadeIn">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                      <span className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center text-sm italic font-mono">04</span>
                      SEO Tags Viral
                    </h2>
                    <button onClick={() => copyToClipboard(activeSession.data!.seoTags!)} className="p-2 bg-slate-50 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg transition-all">📋 Copy</button>
                  </div>
                  <div className="bg-amber-50/30 p-6 rounded-2xl text-slate-600 text-sm tracking-wide leading-relaxed border border-amber-100 font-mono">
                    {activeSession.data.seoTags}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-shake { animation: shake 0.3s ease-in-out; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}} />
    </div>
  );
};

export default App;
