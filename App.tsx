import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import VehicleSelector from './components/VehicleSelector';
import AudioVisualizer from './components/AudioVisualizer';
import SubscriptionModal from './components/SubscriptionModal';
import RepairGuideCard from './components/RepairGuideCard';
import TSBSearchModal from './components/TSBSearchModal';
import { Vehicle, ChatMessage, ConnectionState, ChatSessionMap, TSB } from './types';
import { useLiveSession } from './hooks/useLiveSession';
import { repairGuideTool } from './services/tools';

const API_KEY = process.env.API_KEY || '';

const App: React.FC = () => {
  // Subscription State
  const [isSubscribed, setIsSubscribed] = useState(false);

  // State for managing multiple vehicles and their chat histories
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [currentVehicleId, setCurrentVehicleId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMap>({});
  
  // UI State
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTSBModal, setShowTSBModal] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  const currentVehicle = vehicles.find(v => v.id === currentVehicleId) || null;
  const currentHistory = currentVehicleId ? (sessions[currentVehicleId] || []) : [];

  // Helper to update history for a specific vehicle
  const updateHistory = (vehicleId: string, message: ChatMessage) => {
    setSessions(prev => ({
      ...prev,
      [vehicleId]: [...(prev[vehicleId] || []), message]
    }));
  };

  // --- Live Session Hook ---
  const { 
    connect, 
    disconnect, 
    connectionState, 
    volume, 
    isAiSpeaking 
  } = useLiveSession({
    systemInstruction: currentVehicle?.contextString || '',
    tools: [repairGuideTool],
    onTranscript: (text, sender) => {
      if (!currentVehicleId) return;
      
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: sender,
        text: text,
        timestamp: Date.now()
      };

      setSessions(prev => {
        const vehicleHistory = prev[currentVehicleId] || [];
        const lastMsg = vehicleHistory[vehicleHistory.length - 1];

        if (lastMsg && lastMsg.role === sender && Date.now() - lastMsg.timestamp < 5000 && !lastMsg.repairGuide) {
           const updatedHistory = [...vehicleHistory];
           updatedHistory[updatedHistory.length - 1] = {
             ...lastMsg,
             text: lastMsg.text + text,
             timestamp: Date.now()
           };
           return { ...prev, [currentVehicleId]: updatedHistory };
        }

        return {
          ...prev,
          [currentVehicleId]: [...vehicleHistory, newMessage]
        };
      });
    },
    onToolCall: (toolCall) => {
        // Handle tool calls from Voice Mode
        if (toolCall.name === 'create_repair_guide' && currentVehicleId) {
            try {
                const guideData = toolCall.args as any; // Simplified type assertion
                const systemMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'model',
                    text: `I've prepared a repair checklist for: ${guideData.title}`,
                    timestamp: Date.now(),
                    repairGuide: {
                        title: guideData.title,
                        tools: guideData.tools || [],
                        estimatedTime: guideData.estimatedTime || 'Unknown',
                        steps: (guideData.steps || []).map((step: string) => ({
                            id: crypto.randomUUID(),
                            text: step,
                            isCompleted: false
                        }))
                    }
                };
                updateHistory(currentVehicleId, systemMsg);
                return "Checklist created and displayed to user.";
            } catch (e) {
                console.error("Error processing voice tool", e);
                return "Failed to create checklist.";
            }
        }
        return null;
    }
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentHistory, currentVehicleId]);

  // Cleanup live session when switching vehicles
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
        disconnect();
        setIsLiveMode(false);
    }
  }, [currentVehicleId]);

  const handleVehicleCreated = (vehicle: Vehicle) => {
    setVehicles(prev => [vehicle, ...prev]);
    setCurrentVehicleId(vehicle.id);
    
    const initMsg: ChatMessage = {
        id: 'init',
        role: 'system',
        text: `Vehicle Connected: ${vehicle.year} ${vehicle.make} ${vehicle.model}.\nTech Database Loaded.\n\nModes Available:\n1. Text Chat (Standard)\n2. Live Voice (Say "Hey Revo")\n3. TSB Database Search`,
        timestamp: Date.now()
    };
    setSessions(prev => ({ ...prev, [vehicle.id]: [initMsg] }));
  };

  const handleSelectVehicle = (id: string) => {
    setCurrentVehicleId(id);
  };

  const toggleLiveMode = () => {
    if (isLiveMode) {
      disconnect();
      setIsLiveMode(false);
    } else {
      setIsLiveMode(true);
      connect();
    }
  };

  // Handle discussion from TSB Modal
  const handleDiscussTSB = (tsb: TSB) => {
      setShowTSBModal(false);
      setInputText(`I found TSB ${tsb.bulletinNumber}: "${tsb.title}". The summary is: ${tsb.summary}. Can you explain the repair procedure for this?`);
      // If we want to auto-submit, we can call handleSendText logic here, but putting it in input is safer for user review.
  };

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !currentVehicle || isGenerating) return;

    const text = inputText.trim();
    setInputText('');
    setIsGenerating(true);

    // 1. Add User Message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text,
      timestamp: Date.now()
    };
    updateHistory(currentVehicle.id, userMsg);

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      // Construct history for the model (excluding system/visual logs)
      const historyForModel = currentHistory
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: currentVehicle.contextString,
            tools: [repairGuideTool]
        },
        history: historyForModel
      });

      const result = await chat.sendMessage({ message: text });
      
      // Handle Tool Calls (specifically for Repair Guide)
      const toolCalls = result.functionCalls;
      let responseText = result.text;

      if (toolCalls && toolCalls.length > 0) {
          const call = toolCalls[0];
          if (call.name === 'create_repair_guide') {
              const args = call.args as any;
              const guideMsg: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: 'model',
                  text: responseText || `Here is the repair guide for ${args.title}:`,
                  timestamp: Date.now(),
                  repairGuide: {
                      title: args.title,
                      tools: args.tools || [],
                      estimatedTime: args.estimatedTime || 'Unknown',
                      steps: (args.steps || []).map((step: string) => ({
                          id: crypto.randomUUID(),
                          text: step,
                          isCompleted: false
                      }))
                  }
              };
              updateHistory(currentVehicle.id, guideMsg);
              setIsGenerating(false);
              return; // Exit early as we added the rich message
          }
      }

      const modelMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      updateHistory(currentVehicle.id, modelMsg);

    } catch (error) {
      console.error("Text Chat Error:", error);
      const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          text: "Error: Could not connect to Revo database. Please try again.",
          timestamp: Date.now()
      };
      updateHistory(currentVehicle.id, errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNewSession = () => {
    setCurrentVehicleId(null);
  };

  return (
    <div className="flex h-screen bg-gemini-900 text-gray-100 overflow-hidden font-sans relative">
      
      {/* Subscription Gate */}
      {!isSubscribed && (
        <SubscriptionModal onSubscribe={() => setIsSubscribed(true)} />
      )}

      {/* TSB Modal */}
      {showTSBModal && currentVehicle && (
          <TSBSearchModal 
            vehicle={currentVehicle} 
            onClose={() => setShowTSBModal(false)} 
            onDiscuss={handleDiscussTSB}
          />
      )}

      {/* Sidebar History */}
      <aside className="w-72 bg-gemini-800 border-r border-gray-700 flex-shrink-0 hidden md:flex flex-col z-20">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-blue-200 bg-clip-text text-transparent cursor-pointer" onClick={handleNewSession}>
            REVO
          </h1>
          <div className="flex items-center gap-1">
             <p className="text-xs text-gray-400 mt-1 tracking-wider">AI MASTER TECH</p>
             {isSubscribed && <span className="text-[10px] bg-blue-900 text-blue-300 px-1 rounded border border-blue-500/50">PRO</span>}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
           <button 
              onClick={handleNewSession} 
              className="w-full flex items-center gap-3 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition mb-6 shadow-lg shadow-blue-900/20"
           >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                <span className="font-semibold">New Vehicle</span>
           </button>

           <div className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">Garage History</div>
           
           {vehicles.length === 0 && (
             <div className="text-sm text-gray-600 italic px-2">No vehicles in history</div>
           )}

           {vehicles.map(v => (
             <div 
                key={v.id}
                onClick={() => handleSelectVehicle(v.id)}
                className={`p-3 rounded-lg cursor-pointer transition border ${
                    currentVehicleId === v.id 
                    ? 'bg-blue-900/40 border-blue-500/50' 
                    : 'bg-gray-800/50 border-transparent hover:bg-gray-800 hover:border-gray-600'
                }`}
             >
                <div className="flex justify-between items-start">
                    <div className={`font-bold ${currentVehicleId === v.id ? 'text-white' : 'text-gray-300'}`}>
                        {v.year} {v.make}
                    </div>
                    {currentVehicleId === v.id && <div className="w-2 h-2 bg-blue-400 rounded-full mt-1.5"></div>}
                </div>
                <div className="text-sm text-gray-400 truncate">{v.model}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono truncate">{v.vin || 'NO VIN'}</div>
             </div>
           ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col relative h-full transition-opacity duration-500 ${!isSubscribed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {!currentVehicle ? (
          <VehicleSelector onVehicleCreated={handleVehicleCreated} />
        ) : (
          <>
            {/* Top Bar */}
            <header className="h-16 bg-gemini-800/80 backdrop-blur-md border-b border-gray-700 flex items-center justify-between px-6 z-10 shrink-0">
               <div className="flex items-center gap-4">
                   <button onClick={() => setCurrentVehicleId(null)} className="md:hidden text-gray-400">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                   </button>
                   <div>
                       <h2 className="font-bold text-white text-lg leading-none">{currentVehicle.year} {currentVehicle.make} {currentVehicle.model}</h2>
                       <span className="text-xs text-blue-300 font-mono">{currentVehicle.engine}</span>
                   </div>
               </div>

               <div className="flex items-center gap-4">
                   {/* TSB Search Button */}
                   <button 
                      onClick={() => setShowTSBModal(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-semibold transition border border-gray-600"
                   >
                      <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      <span className="hidden sm:inline">Search TSBs</span>
                   </button>

                   {/* Mode Toggle */}
                   <div className="flex items-center gap-2 bg-gray-900 rounded-full p-1 border border-gray-700">
                       <button 
                          onClick={() => isLiveMode && toggleLiveMode()}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${!isLiveMode ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                       >
                          TEXT
                       </button>
                       <button 
                          onClick={() => !isLiveMode && toggleLiveMode()}
                          className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${isLiveMode ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                       >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                          LIVE
                       </button>
                   </div>
               </div>
            </header>

            {/* Chat Area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth bg-gemini-900/50">
                {currentHistory.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                        <div className={`max-w-[90%] md:max-w-[75%] rounded-2xl p-4 shadow-md ${
                            msg.role === 'user' 
                                ? 'bg-gemini-700 text-white rounded-br-none' 
                                : msg.role === 'system'
                                    ? 'bg-gray-800/50 border border-gray-700 text-gray-400 w-full text-center text-sm font-mono my-4'
                                    : 'bg-blue-900/30 text-blue-50 border border-blue-500/20 rounded-bl-none'
                        }`}>
                            <div className={`flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider font-bold ${msg.role === 'user' ? 'text-gray-400' : 'text-blue-300'}`}>
                                {msg.role === 'model' ? 'REVO' : msg.role === 'system' ? 'SYSTEM' : 'YOU'}
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap text-sm md:text-base">{msg.text}</p>
                            {/* Render Repair Guide if present */}
                            {msg.repairGuide && (
                                <div className="mt-4">
                                    <RepairGuideCard guide={msg.repairGuide} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {/* Spacer */}
                <div className="h-4"></div>
            </div>

            {/* Input Area */}
            <div className="bg-gemini-800 border-t border-gray-700 p-4 z-20">
                <div className="max-w-4xl mx-auto">
                    {isLiveMode ? (
                        /* Live Mode Controls */
                        <div className="flex items-center justify-between gap-4 bg-black/20 p-2 rounded-2xl border border-red-900/30">
                            <div className="flex-1 relative h-16">
                                <AudioVisualizer 
                                    isActive={connectionState === ConnectionState.CONNECTED}
                                    isSpeaking={isAiSpeaking}
                                    volume={volume}
                                />
                                {connectionState === ConnectionState.CONNECTING && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm">
                                        <span className="text-blue-300 text-xs font-mono animate-pulse">CONNECTING SECURE UPLINK...</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-1 shrink-0">
                                <div className="text-[10px] text-red-400 font-mono text-center animate-pulse">LIVE FEED ACTIVE</div>
                                <button 
                                    onClick={toggleLiveMode}
                                    className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl font-bold text-sm transition shadow-lg shadow-red-900/50"
                                >
                                    Disconnect
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Text Mode Controls */
                        <form onSubmit={handleSendText} className="relative flex gap-2">
                            <input 
                                type="text" 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Describe the issue or ask for specs..."
                                className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition placeholder-gray-500"
                                disabled={isGenerating}
                            />
                            <button 
                                type="submit" 
                                disabled={!inputText.trim() || isGenerating}
                                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white p-4 rounded-xl transition shadow-lg"
                            >
                                {isGenerating ? (
                                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={toggleLiveMode}
                                className="absolute right-16 top-2 bottom-2 aspect-square flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                                title="Switch to Voice Mode"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            </button>
                        </form>
                    )}
                    <div className="text-center mt-2">
                         <p className="text-[10px] text-gray-500 font-mono">
                            {isLiveMode ? 'LISTENING FOR "HEY REVO"' : 'REVO v2.5 DIAGNOSTIC SYSTEM READY'}
                         </p>
                    </div>
                </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;