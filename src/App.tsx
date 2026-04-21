import React, { useState, useEffect, useRef, Component, ReactNode } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy,
  deleteDoc,
  doc,
  OperationType,
  handleFirestoreError
} from './firebase';
import { classifyImage } from './services/geminiService';
import { Camera, Image as ImageIcon, LogOut, Plus, Trash2, Search, Heart, Map, Utensils, Users, Info } from 'lucide-react';
import { framer-motion, AnimatePresence } from 'framer-motion';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }


  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-red-50 text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">앗! 문제가 발생했습니다</h1>
          <p className="text-lg text-gray-700 mb-6">죄송합니다. 앱을 다시 불러와주세요.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-red-600 text-white rounded-full font-bold shadow-lg hover:bg-red-700 transition"
          >
            새로고침 하기
          </button>
          <pre className="mt-8 p-4 bg-gray-100 rounded text-xs text-left overflow-auto max-w-full">
            {JSON.stringify(this.state.error, null, 2)}
          </pre>
        </div>
      );
    }
    // @ts-ignore
    return this.props.children;
  }
}


// --- Components ---

interface Photo {
  id: string;
  url: string;
  category: string;
  description: string;
  createdAt: any;
  userId: string;
}

const CATEGORIES = [
  { id: '모두', name: '전체 추억', icon: ImageIcon, color: 'bg-bento-purple-bg border-bento-purple-border', grid: 'md:col-span-2 md:row-span-1' },
  { id: '가족', name: '사랑하는 가족', icon: Users, color: 'bg-bento-blue-bg border-bento-blue-border', grid: 'md:col-span-1 md:row-span-2' },
  { id: '여행', name: '즐거운 여행', icon: Map, color: 'bg-bento-green-bg border-bento-green-border', grid: 'md:col-span-1 md:row-span-1' },
  { id: '추억', name: '소중한 친구', icon: Heart, color: 'bg-bento-orange-bg border-bento-orange-border', grid: 'md:col-span-1 md:row-span-1' },
  { id: '음식', name: '맛있는 음식', icon: Utensils, color: 'bg-white border-gray-200', grid: 'md:col-span-1 md:row-span-1' },
  { id: '풍경', name: '멋진 풍경', icon: Map, color: 'bg-white border-gray-200', grid: 'md:col-span-1 md:row-span-1' },
];

const UNIQUE_CATEGORIES = CATEGORIES;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('모두');
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setPhotos([]);
      return;
    }

    const path = `users/${user.uid}/photos`;
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const photoData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Photo[];
      setPhotos(photoData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleDelete = async () => {
    if (!photoToDelete || !user) return;
    const path = `users/${user.uid}/photos`;
    const docRef = doc(db, path, photoToDelete);
    try {
      await deleteDoc(docRef);
      setPhotoToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${photoToDelete}`);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    
    try {
      const fileList: File[] = Array.from(files);
      
      for (const file of fileList) {
        // Check size
        if (file.size > 800000) {
          alert(`${file.name} 용량이 너무 큽니다. 0.8MB 이하의 사진만 올릴 수 있습니다.`);
          continue;
        }

        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        });

        const mimeType = file.type;
        const base64String = base64Data.split(',')[1];

        // 1. AI Classify
        const classification = await classifyImage(base64String, mimeType);

        // 2. Save to Firestore
        const path = `users/${user.uid}/photos`;
        await addDoc(collection(db, path), {
          url: base64Data,
          category: classification.category || '추억',
          description: classification.description || '소중한 사진입니다.',
          createdAt: new Date(),
          userId: user.uid
        });
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredPhotos = selectedCategory === '모두' 
    ? photos 
    : photos.filter(p => p.category === selectedCategory);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bento-bg">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-bento-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bento-bg flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md bg-white p-12 rounded-[40px] shadow-2xl border-4 border-bento-black"
        >
          <div className="bg-bento-purple-bg border-4 border-bento-purple-border w-24 h-24 rounded-[24px] flex items-center justify-center mx-auto mb-8">
            <ImageIcon className="text-bento-purple-border w-12 h-12" />
          </div>
          <h1 className="text-[52px] font-black text-bento-black mb-6 leading-tight font-sans">시니어<br/>추억 정리함</h1>
          <p className="text-[24px] text-gray-600 mb-10 font-bold font-sans">
            "내 소중한 사진,<br/>이제 AI가 정리에요"
          </p>
          <button 
            onClick={handleLogin}
            className="w-full py-6 bg-bento-black text-white text-[28px] font-black rounded-[32px] shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-4 font-sans"
          >
            시작하기 (구글)
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bento-bg text-bento-ink font-sans p-6 md:p-10 flex flex-col gap-10">
        {/* Header */}
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-[52px] font-black text-bento-black leading-none">나의 추억 상자</h1>
            <div className="text-[24px] text-gray-500 font-bold mt-2">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="bg-bento-grey text-white px-8 py-4 rounded-[24px] text-[20px] font-bold shadow-lg hover:scale-105 transition"
          >
            기록 마감 (로그아웃)
          </button>
        </header>

        {/* Bento Grid - Categories */}
        <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-6 min-h-[400px]">
          {UNIQUE_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-[32px] p-8 flex flex-col justify-between items-start text-left border-[4px] shadow-sm transition-all relative overflow-hidden ${cat.color} ${cat.grid} ${
                selectedCategory === cat.id ? 'ring-8 ring-bento-black/10 scale-[0.98]' : 'hover:scale-[1.02]'
              }`}
            >
              <div className="w-20 h-20 rounded-[20px] bg-white/50 flex items-center justify-center text-[40px]">
                <cat.icon size={40} className="text-current opacity-80" />
              </div>
              <div>
                <div className="text-[36px] font-black mb-2">{cat.name}</div>
                <div className="text-[24px] font-bold opacity-70">
                  {photos.filter(p => p.category === cat.id || (cat.id === '모두')).length}장의 소중한 사진
                </div>
              </div>
              {selectedCategory === cat.id && (
                <div className="absolute top-6 right-6 w-12 h-12 bg-bento-black text-white rounded-full flex items-center justify-center text-[24px] font-black">
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Photos Grid */}
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <div className="w-4 h-12 bg-bento-black rounded-full"></div>
            <h2 className="text-[42px] font-black">{selectedCategory === '모두' ? '최근 모든 사진' : `${selectedCategory} 모아보기`}</h2>
          </div>

          {isUploading && (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border-4 border-dashed border-gray-200">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 border-8 border-bento-purple-border border-t-transparent rounded-full mb-8"
              />
              <p className="text-[32px] font-black text-bento-purple-border">AI 친구가 사진을 정리하고 있어요!</p>
            </div>
          )}

          {!isUploading && filteredPhotos.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[40px] border-4 border-dashed border-gray-200 opacity-60">
              <ImageIcon size={80} className="mx-auto mb-6 text-gray-300" />
              <p className="text-[32px] font-bold text-gray-400">아직 사진이 없네요.<br/>새로운 추억을 채워보세요!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              <AnimatePresence>
                {filteredPhotos.map((photo) => (
                  <motion.div
                    key={photo.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white rounded-[40px] overflow-hidden shadow-xl border-4 border-white hover:border-bento-black transition-all"
                  >
                    <div className="aspect-[4/3] overflow-hidden relative group">
                      <img 
                        src={photo.url} 
                        alt={photo.category}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={() => setPhotoToDelete(photo.id)}
                        className="absolute top-4 right-4 bg-white/90 p-3 rounded-full shadow-lg text-bento-red hover:bg-bento-red hover:text-white transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="사진 삭제"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                    <div className="p-8">
                      <div className="flex gap-3 mb-4">
                        <span className={`px-4 py-1 rounded-full text-[18px] font-black ${
                          CATEGORIES.find(c => c.id === photo.category)?.color || 'bg-gray-100 border-gray-200'
                        } border-2`}>
                          {photo.category}
                        </span>
                      </div>
                      <p className="text-[28px] font-bold text-bento-ink leading-tight mb-4">
                        {photo.description}
                      </p>
                      <div className="text-[20px] text-gray-400 font-bold">
                        {new Date(photo.createdAt.toDate?.() || photo.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer Buttons - Theme Specific */}
        <footer className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-auto">
          <button 
            className="bg-bento-grey py-8 rounded-[32px] text-[28px] font-black text-white shadow-xl hover:translate-y-[-4px] transition-transform"
          >
            환경 설정
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-bento-black py-8 rounded-[32px] text-[28px] font-black text-white shadow-xl hover:translate-y-[-4px] transition-transform flex items-center justify-center gap-4"
          >
            새 추억 가져오기 (+)
          </button>
          <button 
            className="bg-bento-red py-8 rounded-[32px] text-[28px] font-black text-white shadow-xl hover:translate-y-[-4px] transition-transform"
          >
            도움말 요청
          </button>
          <input 
            type="file" 
            accept="image/*" 
            multiple
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </footer>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {photoToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPhotoToDelete(null)}
                className="absolute inset-0 bg-bento-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl border-4 border-bento-black overflow-hidden"
              >
                <div className="text-center">
                  <div className="bg-bento-red/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
                    <Trash2 size={48} className="text-bento-red" />
                  </div>
                  <h2 className="text-[42px] font-black text-bento-black mb-4">정말 삭제할까요?</h2>
                  <p className="text-[24px] text-gray-500 font-bold mb-10 leading-relaxed">
                    삭제한 사진은 다시 되돌릴 수 없어요.<br/>그래도 괜찮으신가요?
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => setPhotoToDelete(null)}
                      className="flex-1 py-6 bg-gray-100 text-bento-ink text-[24px] font-black rounded-[24px] hover:bg-gray-200 transition"
                    >
                      아니오, 그냥 둘게요
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex-1 py-6 bg-bento-red text-white text-[24px] font-black rounded-[24px] shadow-lg hover:scale-105 transition active:scale-95"
                    >
                      네, 지워주세요
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
