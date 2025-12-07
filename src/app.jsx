import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Copy, RefreshCw, Wand2, ArrowRightLeft, Eraser, Check, Volume2, BookOpen, Download, LayoutList, MessageCircleQuestion, GraduationCap, X, ChevronRight, RotateCcw, Volume2 as SpeakerIcon } from 'lucide-react';

// Helper function to call the secure backend proxy
const secureGeminiCall = async (task, payload) => {
  const response = await fetch('/api/gemini', { // The new secure endpoint
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task, payload }), // Send task and data to the backend
  });

  if (!response.ok) {
    // If the backend returns an error (like 500 or 400)
    const errorData = await response.json();
    throw new Error(errorData.error || `Secure API call failed with status: ${response.status}`);
  }

  const data = await response.json();
  return data; // Returns the { result } or { audioData, mimeType } object
};

const NajdiStudyApp = () => {
  const [mode, setMode] = useState('study'); // 'study' or 'quiz'
  const [inputText, setInputText] = useState('');
  const [processedList, setProcessedList] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Quiz State
  const [quizState, setQuizState] = useState(null);
  const [score, setScore] = useState(0);
  const [quizStatus, setQuizStatus] = useState('idle'); // 'idle', 'inProgress', 'finished'

  // TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  useEffect(() => {
    // Initialization hook.
  }, []);
  
  // --- Utility Functions: Audio Conversion (PCM to WAV) ---
  // The Gemini TTS API returns raw PCM audio data, which must be wrapped in a WAV container 
  // before a browser's <audio> element can play it.

  // Helper to convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Helper to convert PCM audio to WAV blob
  const pcmToWav = (pcmData, sampleRate) => {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier 'RIFF'
    writeString(view, 0, 'RIFF');
    // file size (4 bytes)
    view.setUint32(4, 36 + pcmData.length * 2, true);
    // WAVE identifier 'WAVE'
    writeString(view, 8, 'WAVE');
    // format chunk identifier 'fmt '
    writeString(view, 12, 'fmt ');
    // format chunk length (16 bytes)
    view.setUint32(16, 16, true);
    // sample format (1 means PCM)
    view.setUint16(20, 1, true);
    // number of channels (1)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (SampleRate * Channels * BitsPerSample / 8)
    view.setUint32(28, sampleRate * 2 * 1, true);
    // block align (Channels * BitsPerSample / 8)
    view.setUint16(32, 2, true);
    // bits per sample (16 bit)
    view.setUint16(34, 16, true);
    // data chunk identifier 'data'
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, pcmData.length * 2, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        view.setInt16(offset, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const clearAll = () => {
    setInputText('');
    setProcessedList([]);
    setStatusMessage('Input cleared. Ready for a new list.');
    setMode('study');
    setQuizState(null);
    setScore(0);
    setQuizStatus('idle');
  };

  const copyToClipboard = () => {
    const textToCopy = processedList.map(item => `${item.arabic} - ${item.english}`).join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
        setStatusMessage('List copied to clipboard!');
    }).catch(err => {
        console.error('Could not copy text: ', err);
        setStatusMessage('Failed to copy list.');
    });
  };

  const downloadList = () => {
    const content = processedList.map(item => `${item.arabic} - ${item.english}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'najdi_vocabulary_list.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('List downloaded as text file.');
  };
  
  // --- Gemini API Functions (TTS) ---

  const speakArabicWord = async (arabicWord) => {
    if (isSpeaking) return;

    setIsSpeaking(true);
    setStatusMessage('Generating audio...');
    
    try {
        // --- REPLACED: Removed old fetch logic and API_KEY ---
        const payload = {
            prompt: `Say the Najdi Arabic word "${arabicWord}". Speak with a clear, local Najdi accent.`,
        };
        const { audioData, mimeType } = await secureGeminiCall('tts', payload);
        // --- END REPLACEMENT ---

        if (audioData && mimeType && mimeType.startsWith("audio/L16;")) {
            const sampleRateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
            
            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            
            const audio = new Audio(audioUrl);
            audio.onended = () => {
                setIsSpeaking(false);
                setStatusMessage(`Audio finished for "${arabicWord}".`);
                URL.revokeObjectURL(audioUrl);
            };
            audio.onerror = () => {
                setIsSpeaking(false);
                setStatusMessage('Error playing audio.');
                URL.revokeObjectURL(audioUrl);
            };
            audio.play();
            setStatusMessage(`Playing audio for "${arabicWord}"...`);
        } else {
            throw new Error("Invalid audio response structure or MIME type from backend.");
        }

    } catch (e) {
        console.error("Gemini TTS Error:", e);
        setIsSpeaking(false);
        setStatusMessage('Error generating audio via secure API. Please try again.');
    }
  };


  // --- Gemini API Functions (Translation, Harakat & Enrichment) ---
  
  // Fetches Harakat (vowelization/diacritics) for an Arabic word
  const generateHarakat = async (arabicWord) => {
    
    const systemInstruction = "You are an expert Arabic linguist. Your task is to provide the fully vowelized (with Harakat/diacritics) version of a given Najdi Arabic word or phrase. Output ONLY the vowelized word/phrase.";
    const userQuery = `Provide the fully vowelized version of the Najdi Arabic word: "${arabicWord}".`;

    try {
        // --- REPLACED: Removed old fetch logic and API_KEY ---
        const payload = {
            prompt: userQuery,
            systemInstruction: systemInstruction,
        };
        const data = await secureGeminiCall('harakat', payload);
        
        return data.result.trim().replace(/['"`]+/g, ''); // Clean up quotes
        // --- END REPLACEMENT ---
        
    } catch (e) {
      console.error(`Gemini Harakat Error:`, e);
      return arabicWord; // Fallback to original
    }
  };

  // Translates Arabic-only words and fetches Harakat for the entire list
  const translateWithGemini = async (items) => {
    const words = items.map(i => i.arabic).join(', ');
    const prompt = `
      You are an expert in Najdi Arabic dialect. 
      I have a list of Arabic words/phrases: [${words}].
      
      For each word, provide the closest English meaning.
      Return strictly a JSON array of objects with keys "arabic" and "english".
      Do not include markdown formatting (like \`\`\`json). Just the raw JSON.
      
      Example output format:
      [
        {"arabic": "word1", "english": "meaning1"},
        {"arabic": "word2", "english": "meaning2"}
      ]
    `;

    try {
        // --- REPLACED: Removed old fetch logic and API_KEY ---
        const payload = {
            prompt: prompt,
        };
        const data = await secureGeminiCall('translation', payload);
        
        const textResponse = data.result;
        // --- END REPLACEMENT ---

        const cleanJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson);

        // Map and include harakat processing promise
        const translationPromises = items.map(async (item, index) => {
            const match = parsedData.find(p => p.arabic.includes(item.arabic) || item.arabic.includes(p.arabic)) || parsedData[index];
            
            const english = match ? match.english : '???';
            // Only fetch harakat if we successfully got a translation or it was manually entered
            const harakat = english !== '???' ? await generateHarakat(item.arabic) : item.arabic;
            
            return {
                ...item,
                english,
                harakat,
                sentence: null,
                pronunciation: null,
                loadingFeature: null,
            };
        });
        
        return await Promise.all(translationPromises);

    } catch (e) {
        console.error("Gemini Translation/Harakat Error:", e);
        throw e;
    }
  };

  // Generates example sentences or phonetic transliterations on demand
  const generateContextualInfo = async (arabicWord, type) => {
    
    const systemInstruction = type === 'sentence' 
      ? "You are a language tutor specializing in Najdi Arabic. Provide a single, short, and common example sentence."
      : "You are a linguistic expert focusing on Arabic phonetics. Provide the simplest, human-readable English phonetic guide (transliteration).";

    let userQuery = '';
    if (type === 'sentence') {
        userQuery = `For the Najdi Arabic word "${arabicWord}", provide one simple example sentence in Arabic, followed by its English translation on a new line. Format: [ARABIC SENTENCE]\n[ENGLISH TRANSLATION].`;
    } else if (type === 'pronunciation') {
        userQuery = `Provide the closest, simplest, and most human-readable English phonetic transliteration (pronunciation guide) for the Najdi Arabic word "${arabicWord}". Only output the phonetic text.`;
    }

    try {
        // --- REPLACED: Removed old fetch logic and API_KEY ---
        const task = type === 'sentence' ? 'sentence' : 'pronunciation';
        const payload = {
            prompt: userQuery,
            systemInstruction: systemInstruction,
        };
        const data = await secureGeminiCall(task, payload);
        
        return data.result.trim();
        // --- END REPLACEMENT ---
        
    } catch (e) {
      console.error(`Gemini ${type} Error:`, e);
      return `[Error fetching ${type}]`;
    }
  };

  // --- Study/Input Mode Logic ---

  const handleProcess = async () => {
    if (!inputText.trim()) return;
    
    setIsProcessing(true);
    setStatusMessage('Analyzing list...');

    const lines = inputText.split('\n').filter(line => line.trim() !== '');
    const wordsToTranslate = [];
    const completeItems = [];

    // 1. Initial Parsing and Categorization (Separates Arabic-only from Arabic-English pairs)
    lines.forEach((line, index) => {
      const separatorRegex = /[-–—,:]/;
      const hasSeparator = separatorRegex.test(line);

      if (hasSeparator) {
        const parts = line.split(separatorRegex);
        let rawSegment1 = parts[0].trim();
        const english = parts.slice(1).join(' ').trim();
        
        // Robustly extract ONLY the Arabic characters from the first segment. 
        const arabicMatch = rawSegment1.match(/[\u0600-\u06FF]+/g) || [];
        const arabic = arabicMatch.join(' ').trim(); 

        completeItems.push({ id: index, arabic, english: english.trim(), original: line, sentence: null, pronunciation: null, loadingFeature: null, harakat: null });
      } else {
        wordsToTranslate.push({ id: index, arabic: line.trim() });
      }
    });

    // 2. Translation & Harakat Generation (if needed)
    let mergedList = [...completeItems];
    if (wordsToTranslate.length > 0) {
      setStatusMessage(`Translating ${wordsToTranslate.length} Najdi words and generating Harakat...`);
      try {
        const translatedItems = await translateWithGemini(wordsToTranslate);
        mergedList = [...completeItems, ...translatedItems];
        setStatusMessage('Translation and initial formatting complete.');
      } catch (error) {
        setStatusMessage('Error fetching translations. Showing formatted list only. Some translations might be missing.');
        const fallback = wordsToTranslate.map(w => ({ ...w, english: '???', sentence: null, pronunciation: null, loadingFeature: null, harakat: w.arabic }));
        mergedList = [...completeItems, ...fallback];
      }
    } else {
      // Process harakat for manually entered items
      setStatusMessage('Generating Harakat for existing entries...');
      try {
          const harakatPromises = completeItems.map(async (item) => {
              const harakat = await generateHarakat(item.arabic);
              return { ...item, harakat };
          });
          mergedList = await Promise.all(harakatPromises);
          setStatusMessage('Formatting complete.');
      } catch (e) {
          setStatusMessage('Error generating Harakat. Showing formatted list only.');
          mergedList = completeItems.map(item => ({...item, harakat: item.arabic}));
      }
    }
    
    // 3. Process for Synonyms (Split multi-word Arabic entries entered with separators like / or ,)
    const finalItems = [];
    mergedList.sort((a, b) => a.id - b.id).forEach(item => {
        const synonymSeparatorRegex = /\s*[\/,]\s*/; 
        
        if (item.arabic && item.english !== '???' && synonymSeparatorRegex.test(item.arabic)) {
            const arabicWords = item.arabic.split(synonymSeparatorRegex).filter(w => w.length > 0);
            
            arabicWords.forEach((word, wordIndex) => {
                // For simplicity, use the base word as harakat for split synonyms
                finalItems.push({
                    ...item,
                    arabic: word, 
                    id: `${item.id}_syn${wordIndex}`, 
                    harakat: word, 
                    sentence: null, 
                    pronunciation: null,
                });
            });
        } else {
            finalItems.push(item);
        }
    });

    setProcessedList(finalItems.filter(item => item.arabic.length > 0 && item.english.length > 0));
    setIsProcessing(false);
  };

  // Handles the on-demand generation of phonetic guides or example sentences
  const handleFeatureGeneration = async (index, type) => {
    const list = [...processedList];
    const item = list[index];
    
    if (item.loadingFeature && item.loadingFeature !== type) return;
    
    item.loadingFeature = type;
    setProcessedList(list);

    try {
      const result = await generateContextualInfo(item.arabic, type);
      
      if (type === 'sentence') {
        item.sentence = result;
      } else if (type === 'pronunciation') {
        item.pronunciation = result;
      }
    } catch (e) {
      setStatusMessage(`Error generating ${type}. Check console.`);
      if (type === 'sentence') {
        item.sentence = 'Error.';
      } else if (type === 'pronunciation') {
        item.pronunciation = 'Error.';
      }
    } finally {
      item.loadingFeature = null;
      setProcessedList([...list]); 
    }
  };
  
  // --- Quiz Mode Logic ---

  // Prepares the list of multiple-choice questions
  const prepareQuiz = useCallback(() => {
    if (processedList.length < 4) {
      setStatusMessage(`You need at least 4 words to start a quiz (you have ${processedList.length}).`);
      return;
    }

    const shuffledWords = [...processedList]
        .filter(w => w.english !== '???')
        .sort(() => Math.random() - 0.5);

    const questions = shuffledWords.map((word, index) => {
      // Correct answer is the English meaning
      const correctAnswer = word.english;

      // Select three random incorrect answers from the pool
      const incorrectAnswers = processedList
        .filter(w => w.english !== correctAnswer && w.english !== '???')
        .map(w => w.english);

      // Shuffle the incorrect answers and take the first 3
      const shuffledIncorrect = incorrectAnswers.sort(() => Math.random() - 0.5).slice(0, 3);
      
      // Combine and shuffle the options
      const options = [correctAnswer, ...shuffledIncorrect].sort(() => Math.random() - 0.5);

      return {
        id: index,
        arabic: word.arabic,
        harakat: word.harakat || word.arabic, // Use generated harakat or fallback
        correctAnswer: correctAnswer,
        options: options,
        selectedAnswer: null,
        isCorrect: null,
      };
    });

    setQuizState({
        questions: questions,
        currentQuestionIndex: 0,
    });
    setScore(0);
    setQuizStatus('inProgress');
    setStatusMessage(`Quiz started! ${questions.length} questions remaining.`);
    setMode('quiz');
  }, [processedList]);

  // Handles user's selection of an answer
  const handleAnswer = (selectedOption) => {
    if (!quizState || quizStatus === 'finished') return;

    const currentQuestionIndex = quizState.currentQuestionIndex;
    const currentQuestion = quizState.questions[currentQuestionIndex];
    
    // Check if question was already answered
    if (currentQuestion.selectedAnswer) return;

    const isCorrect = selectedOption === currentQuestion.correctAnswer;

    // Update the question state
    const updatedQuestions = [...quizState.questions];
    updatedQuestions[currentQuestionIndex] = {
      ...currentQuestion,
      selectedAnswer: selectedOption,
      isCorrect: isCorrect,
    };

    // Update score
    if (isCorrect) {
      setScore(s => s + 1);
    }
    
    // Update quiz state to reflect the answer
    setQuizState(s => ({
        ...s,
        questions: updatedQuestions,
    }));
  };

  // Moves to the next question or ends the quiz
  const nextQuestion = () => {
    if (!quizState) return;

    const nextIndex = quizState.currentQuestionIndex + 1;
    
    if (nextIndex < quizState.questions.length) {
        // Move to next question
        setQuizState(s => ({
            ...s,
            currentQuestionIndex: nextIndex,
        }));
    } else {
        // Quiz finished
        setQuizStatus('finished');
        setStatusMessage(`Quiz finished! Final score: ${score}/${quizState.questions.length}`);
    }
  };
  
  // Memoized current question for efficient rendering
  const currentQuestion = useMemo(() => {
    if (quizState && (quizStatus === 'inProgress' || quizStatus === 'finished')) {
        return quizState.questions[quizState.currentQuestionIndex];
    }
    return null;
  }, [quizState, quizStatus]);
  
  // --- UI Components ---
  
  const QuizResultScreen = () => (
    <div className="flex flex-col items-center justify-center p-8 text-center h-full bg-emerald-50 rounded-xl shadow-inner">
      <GraduationCap className="w-16 h-16 text-emerald-600 mb-4" />
      <h2 className="text-3xl font-bold text-emerald-800 mb-2">Quiz Complete!</h2>
      <p className="text-xl text-slate-700 mb-6">You scored:</p>
      <div className="text-5xl font-extrabold text-white bg-emerald-600 rounded-full w-24 h-24 flex items-center justify-center shadow-lg mb-8">
        {score} / {quizState.questions.length}
      </div>
      <button 
        onClick={prepareQuiz} 
        className="bg-purple-600 text-white py-3 px-8 rounded-full font-semibold hover:bg-purple-700 transition-colors shadow-lg flex items-center gap-2 text-lg"
      >
        <RotateCcw className="w-5 h-5" /> Start New Quiz
      </button>
      <button 
        onClick={() => setMode('study')} 
        className="mt-4 text-slate-500 hover:text-slate-700 text-sm"
      >
        Return to Study List
      </button>
    </div>
  );

  const QuizQuestionScreen = () => {
    if (!currentQuestion) return <div className="p-8 text-center text-slate-500">Prepare your list to start a quiz.</div>;

    const answered = currentQuestion.selectedAnswer !== null;

    return (
        <div className="p-4 sm:p-6 h-full flex flex-col justify-between">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                     <p className="text-sm font-semibold text-purple-600">
                        Question {quizState.currentQuestionIndex + 1} of {quizState.questions.length}
                     </p>
                     <div className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                        Score: {score}
                    </div>
                </div>
                
                {/* Arabic Word and Speaker Button (Single interactive block) */}
                <button 
                    onClick={() => speakArabicWord(currentQuestion.arabic)}
                    disabled={isSpeaking}
                    className="w-full relative flex flex-col items-center justify-center bg-emerald-100 p-6 rounded-2xl shadow-lg border-b-4 border-emerald-500 hover:bg-emerald-200 active:scale-[0.99] transition-all disabled:bg-slate-200 disabled:cursor-wait"
                    title={isSpeaking ? "Generating Audio..." : "Click to hear the word"}
                >
                    <div className="absolute top-3 right-3 p-2 bg-white/70 rounded-full shadow-md text-emerald-600">
                        {isSpeaking ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                            <SpeakerIcon className="w-5 h-5" />
                        )}
                    </div>

                    <h3 className="text-4xl sm:text-5xl font-arabic font-bold text-emerald-800" lang="ar">
                        {currentQuestion.harakat}
                    </h3>
                    <p className="text-center text-sm text-slate-500 mt-1">
                        ({currentQuestion.arabic})
                    </p>
                    <p className="text-center text-base text-slate-600 mt-2 font-medium">What is the correct English meaning?</p>
                </button>
            </div>

            <div className="flex-1 space-y-4 pt-4">
                {currentQuestion.options.map((option, idx) => {
                    const isSelected = currentQuestion.selectedAnswer === option;
                    const isCorrectOption = option === currentQuestion.correctAnswer;
                    
                    let className = "w-full text-left py-4 px-5 rounded-xl font-medium transition-all shadow-md border text-base sm:text-lg";

                    if (answered) {
                        if (isCorrectOption) {
                            className += " bg-green-100 border-green-500 text-green-800 shadow-xl";
                        } else if (isSelected && !isCorrectOption) {
                            className += " bg-red-100 border-red-500 text-red-800 line-through";
                        } else {
                            className += " bg-white border-slate-200 text-slate-700 opacity-50 cursor-default";
                        }
                    } else {
                        className += " bg-white border-slate-300 text-slate-800 hover:bg-emerald-50 hover:border-emerald-400 cursor-pointer active:scale-[0.99]";
                    }

                    return (
                        <button 
                            key={idx} 
                            onClick={() => !answered && handleAnswer(option)} 
                            className={className}
                            disabled={answered}
                        >
                            <span className="flex items-center justify-between">
                                {option}
                                {answered && isSelected && (isCorrectOption ? <Check className="w-5 h-5 text-green-700" /> : <X className="w-5 h-5 text-red-700" />)}
                                {answered && !isSelected && isCorrectOption && <Check className="w-5 h-5 text-green-700" />}
                            </span>
                        </button>
                    );
                })}
            </div>
            
            {/* Navigation */}
            {answered && (
                <div className="mt-8">
                    <button
                        onClick={nextQuestion}
                        className="w-full bg-purple-600 text-white py-4 rounded-xl font-semibold shadow-xl hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-lg active:scale-[0.99]"
                    >
                        {quizState.currentQuestionIndex === quizState.questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
  };
  
  const StudyList = () => (
    <ul className="space-y-4">
      {processedList.map((item, idx) => {
        const isFeatureLoading = (type) => item.loadingFeature === type;
        return (
          <li key={item.id} className="bg-white p-4 rounded-xl shadow-md border border-slate-100">
            
            {/* Vocab Pair */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col w-full">
                <span className="text-xl font-arabic text-emerald-900 font-medium dir-rtl mb-1" lang="ar">
                  {item.arabic}
                </span>
                <span className="text-sm text-slate-700 font-medium">
                  - {item.english}
                </span>
                {/* Harakat display in study mode (optional) */}
                {item.harakat && item.harakat !== item.arabic && (
                    <span className="text-xs font-arabic text-slate-500 mt-0.5 dir-rtl" lang="ar">
                        ({item.harakat})
                    </span>
                )}
              </div>
              
              {/* Feature Buttons */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => speakArabicWord(item.arabic)}
                  disabled={isSpeaking || isFeatureLoading('tts')} // Use shared TTS lock
                  title="Generate Spoken Audio (TTS)"
                  className="p-2 text-sm text-green-600 bg-green-50 rounded-full hover:bg-green-100 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {isSpeaking 
                    ? <RefreshCw className="w-4 h-4 animate-spin" /> 
                    : <Volume2 className="w-4 h-4" />}
                </button>
                
                <button
                  onClick={() => handleFeatureGeneration(idx, 'pronunciation')}
                  disabled={isFeatureLoading('pronunciation')}
                  title="Generate Phonetic Guide"
                  className="p-2 text-sm text-sky-600 bg-sky-50 rounded-full hover:bg-sky-100 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {isFeatureLoading('pronunciation') 
                    ? <RefreshCw className="w-4 h-4 animate-spin" /> 
                    : <ArrowRightLeft className="w-4 h-4" />}
                </button>
                
                <button
                  onClick={() => handleFeatureGeneration(idx, 'sentence')}
                  disabled={isFeatureLoading('sentence')}
                  title="Generate Example Sentence"
                  className="p-2 text-sm text-purple-600 bg-purple-50 rounded-full hover:bg-purple-100 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {isFeatureLoading('sentence') 
                    ? <RefreshCw className="w-4 h-4 animate-spin" /> 
                    : <BookOpen className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Contextual Info Display */}
            {(item.pronunciation || item.sentence) && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-sm">
                {item.pronunciation && (
                  <div className="flex items-start gap-2 text-slate-600 bg-slate-50 p-2 rounded-lg">
                    <Volume2 className="w-4 h-4 mt-1 shrink-0 text-sky-600" />
                    <span className="font-mono text-xs italic">
                      {item.pronunciation}
                    </span>
                  </div>
                )}
                {item.sentence && (
                  <div className="flex flex-col gap-1 text-slate-700 bg-slate-50 p-2 rounded-lg">
                    <div className="flex items-start gap-2">
                      <BookOpen className="w-4 h-4 mt-1 shrink-0 text-purple-600" />
                      <div className="flex flex-col">
                          <span className="font-arabic dir-rtl text-right w-full text-base">{item.sentence.split('\n')[0]}</span>
                          <span className="text-xs text-purple-800 mt-1">{item.sentence.split('\n')[1]}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );


  // --- Main Render ---
  
  // Conditional classes for the main grid based on the mode
  const gridClasses = mode === 'study' 
    ? "grid gap-6 lg:grid-cols-2 lg:h-[700px] h-auto" // Two columns on large screens, stack on mobile/tablet
    : "flex justify-center items-start lg:items-center min-h-[700px] lg:h-[800px] w-full"; // Single, centered column for quiz

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-2 sm:p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-emerald-800 mb-2 font-serif">
            Integrated Najdi Study Companion
          </h1>
          <p className="text-slate-600">
            Process vocabulary (Study Mode) and test your knowledge (Quiz Mode).
          </p>
        </header>

        {/* Mode Selector */}
        <div className="flex justify-center gap-4 mb-6">
            <button
                onClick={() => setMode('study')}
                className={`py-2 px-6 rounded-full font-semibold transition-all flex items-center gap-2 text-sm
                    ${mode === 'study' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'}`}
            >
                <LayoutList className="w-4 h-4" /> Study Mode
            </button>
            <button
                onClick={processedList.length >= 4 ? prepareQuiz : () => setStatusMessage(`You need at least 4 valid words to start a quiz (you have ${processedList.length}).`)}
                disabled={processedList.length < 4 && mode !== 'quiz'} 
                className={`py-2 px-6 rounded-full font-semibold transition-all flex items-center gap-2 text-sm
                    ${mode === 'quiz' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'}
                    ${processedList.length < 4 && mode !== 'quiz' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <MessageCircleQuestion className="w-4 h-4" /> Quiz Mode
            </button>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className={gridClasses}>
          
          {/* Panel 1 / Quiz Container */}
          <div 
            className={`flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden 
                       ${mode === 'quiz' ? 'lg:col-span-1 w-full max-w-lg mx-auto h-[700px]' : 'w-full'}`}
          >
            {mode === 'study' ? (
                // Study Input Panel (Left column on desktop)
                <>
                    <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                        <span className="font-semibold text-slate-700 flex items-center gap-2">
                            <ArrowRightLeft className="w-4 h-4" /> Raw Input
                        </span>
                        <button 
                            onClick={clearAll}
                            className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
                        >
                            <Eraser className="w-3 h-3" /> Clear
                        </button>
                    </div>
                    <textarea
                        className="flex-1 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-lg dir-rtl"
                        placeholder={`Example:\nالكتاب - The book\nمعرس / عريس - Groom\nشلونك (Will be translated)\nوينك - Where are you`}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        dir="auto"
                    />
                    <div className="p-4 bg-slate-50 border-t border-slate-200">
                        <button
                            onClick={handleProcess}
                            disabled={isProcessing || !inputText.trim()}
                            className={`w-full py-3 rounded-xl font-medium text-white shadow-md transition-all flex items-center justify-center gap-2
                                ${isProcessing 
                                    ? 'bg-slate-400 cursor-not-allowed' 
                                    : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg active:scale-[0.98]'
                                }`}
                        >
                            {isProcessing ? (
                                <>
                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-5 h-5" />
                                    Process & Format List
                                </>
                            )}
                        </button>
                    </div>
                </>
            ) : (
                // Quiz Question Panel (Single Column view)
                quizStatus === 'finished' ? <QuizResultScreen /> : <QuizQuestionScreen />
            )}
          </div>

          {/* Panel 2 (Only rendered in Study Mode, Right column on desktop) */}
          {mode === 'study' && (
            <div className="flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                    <span className="font-semibold text-slate-700 flex items-center gap-2">
                        <Check className="w-4 h-4" /> 
                        Formatted List ({processedList.length})
                    </span>
                    <div className="flex gap-3">
                        {processedList.length > 0 && (
                            <>
                                <button 
                                onClick={downloadList}
                                className="text-xs bg-emerald-500 text-white border border-emerald-600 px-3 py-1 rounded-full hover:bg-emerald-600 flex items-center gap-1 transition-colors shadow-md"
                                >
                                <Download className="w-3 h-3" /> Download
                                </button>
                                <button 
                                onClick={copyToClipboard}
                                className="text-xs bg-white border border-slate-300 px-3 py-1 rounded-full hover:bg-slate-50 flex items-center gap-1 transition-colors"
                                >
                                <Copy className="w-3 h-3" /> Copy
                                </button>
                            </>
                        )}
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                    {processedList.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <div className="text-6xl mb-4">📖</div>
                            <p>Processed words appear here. Start by pasting your list!</p>
                        </div>
                    ) : (
                        <StudyList />
                    )}
                </div>
            </div>
          )}
        </div>
        
        {/* Status Bar (Moved outside the grid to ensure visibility across modes) */}
        <div className="mt-6 h-10 bg-emerald-50 border border-emerald-100 flex items-center px-4 text-xs font-medium text-emerald-700 rounded-lg max-w-4xl mx-auto">
            {statusMessage || (mode === 'study' ? "Ready to process your list." : "Quiz in progress. Good luck!")}
        </div>

        <div className="mt-8 text-center text-slate-400 text-sm">
          Built with Gemini AI. Optimized for Najdi Arabic vocabulary.
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;700&display=swap');
        .font-arabic {
          font-family: 'Noto Sans Arabic', sans-serif;
        }
        /* Ensure the Arabic text is always right-to-left within its container */
        .dir-rtl {
            direction: rtl;
            text-align: right;
        }
      `}</style>
    </div>
  );
};

export default NajdiStudyApp;