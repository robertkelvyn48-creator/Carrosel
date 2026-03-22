import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Settings2, Layers, Plus, Trash2, Loader2, Image as ImageIcon, MoveVertical, Type as TypeIcon, AlignCenter, LayoutTemplate, RotateCcw, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractTextFromImage } from '../services/geminiService';
import { get, set } from 'idb-keyval';
import JSZip from 'jszip';

type AspectRatio = '1080x1350' | '1080x1346';

interface Slide {
  id: string;
  image: string;
  text: string;
  fontSize: number;
  offsetY: number;
  offsetX: number;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  showFooter: boolean;
  loading: boolean;
  textWidth?: number;
  textColor?: string;
  highlightColor?: string;
}

// Função para redimensionar a imagem antes de enviar para a API (melhora a velocidade)
const resizeImageForAPI = (dataUrl: string, maxSize: number = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxSize) {
          height *= (maxSize / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= (maxSize / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

export const CarouselEditor: React.FC = () => {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    return (localStorage.getItem('carousel_aspectRatio') as AspectRatio) || '1080x1350';
  });
  const [logoImage, setLogoImage] = useState<string | null>(() => {
    return localStorage.getItem('carousel_logo') || null;
  });
  const [showLogo, setShowLogo] = useState(() => {
    const saved = localStorage.getItem('carousel_showLogo');
    return saved !== null ? saved === 'true' : true;
  });
  const [footerText, setFooterText] = useState(() => {
    return localStorage.getItem('carousel_footerText') || 'ARRASTE PRO LADO>>';
  });
  const [footerFontSize, setFooterFontSize] = useState(() => {
    const saved = localStorage.getItem('carousel_footerFontSize');
    return saved ? parseInt(saved, 10) : 29;
  });
  const [globalFont, setGlobalFont] = useState(() => {
    return localStorage.getItem('carousel_globalFont') || 'Bebas Neue Pro';
  });
  const [customFontUrl, setCustomFontUrl] = useState<string | null>(() => {
    return localStorage.getItem('carousel_customFont') || null;
  });
  const [overlayColor, setOverlayColor] = useState(() => {
    return localStorage.getItem('carousel_overlayColor') || '#000000';
  });
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const dimensions = {
    '1080x1350': { width: 1080, height: 1350 },
    '1080x1346': { width: 1080, height: 1346 }
  }[aspectRatio];

  useEffect(() => {
    get('carousel_slides').then((val) => {
      if (val && Array.isArray(val)) {
        setSlides(val);
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const timeoutId = setTimeout(() => {
        set('carousel_slides', slides).catch(console.error);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [slides, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('carousel_aspectRatio', aspectRatio);
      localStorage.setItem('carousel_showLogo', String(showLogo));
      localStorage.setItem('carousel_footerText', footerText);
      localStorage.setItem('carousel_footerFontSize', String(footerFontSize));
      localStorage.setItem('carousel_globalFont', globalFont);
      localStorage.setItem('carousel_overlayColor', overlayColor);
      if (customFontUrl) {
        try {
          localStorage.setItem('carousel_customFont', customFontUrl);
        } catch (e) {
          console.warn('Font too large for localStorage');
        }
      } else {
        localStorage.removeItem('carousel_customFont');
      }
    }
  }, [aspectRatio, showLogo, footerText, footerFontSize, globalFont, overlayColor, customFontUrl, isLoaded]);

  useEffect(() => {
    if (customFontUrl) {
      const font = new FontFace('CustomOrganetto', `url(${customFontUrl})`);
      font.load().then((loadedFont) => {
        document.fonts.add(loadedFont);
      }).catch((error) => {
        console.error('Error loading custom font:', error);
      });
    }
  }, [customFontUrl]);

  const handleFontUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setCustomFontUrl(base64);
      setGlobalFont('Organetto Bold'); // Auto-select when uploaded
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setLogoImage(base64);
      try {
        localStorage.setItem('carousel_logo', base64);
      } catch (e) {
        console.warn('Logo too large for localStorage');
      }
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoImage(null);
    localStorage.removeItem('carousel_logo');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;

    const newSlides: Slide[] = await Promise.all(
      files.map(async (file) => {
        return new Promise<Slide>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              id: Math.random().toString(36).substring(7),
              image: reader.result as string,
              text: '',
              fontSize: 84,
              offsetY: 0,
              offsetX: 0,
              imageScale: 1,
              imageOffsetX: 0,
              imageOffsetY: 0,
              showFooter: true,
              loading: true,
            });
          };
          reader.readAsDataURL(file);
        });
      })
    );

    setSlides((prev) => [...prev, ...newSlides]);

    for (const slide of newSlides) {
      try {
        const resizedDataUrl = await resizeImageForAPI(slide.image);
        const base64Data = resizedDataUrl.split(',')[1];
        const textData = await extractTextFromImage(base64Data);
        setSlides((prev) => 
          prev.map((s) => (s.id === slide.id ? { ...s, text: textData.text, loading: false } : s))
        );
      } catch (error) {
        console.error("Erro ao processar slide", slide.id, error);
        setSlides((prev) => 
          prev.map((s) => (s.id === slide.id ? { ...s, loading: false } : s))
        );
      }
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSlide = (id: string) => {
    setSlides((prev) => prev.filter((s) => s.id !== id));
    canvasRefs.current.delete(id);
  };

  const handleUpdateSlide = (id: string, updates: Partial<Slide>) => {
    setSlides((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  };

  const handleApplyStyleToAll = (sourceSlide: Slide) => {
    setSlides((prev) => prev.map((s) => {
      if (s.id === sourceSlide.id) return s;
      return {
        ...s,
        fontSize: sourceSlide.fontSize,
        textWidth: sourceSlide.textWidth,
        offsetX: sourceSlide.offsetX,
        offsetY: sourceSlide.offsetY,
        textColor: sourceSlide.textColor,
        highlightColor: sourceSlide.highlightColor,
      };
    }));
  };

  const handleExport = async () => {
    if (slides.length === 0) return;
    setIsExporting(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (slides.length === 1) {
        const canvas = canvasRefs.current.get(slides[0].id);
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `slide-1.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        const zip = new JSZip();
        
        slides.forEach((slide, index) => {
          const canvas = canvasRefs.current.get(slide.id);
          if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];
            zip.file(`slide-${index + 1}.png`, base64Data, { base64: true });
          }
        });
        
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'carrossel.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Erro ao exportar carrossel", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 flex flex-col md:flex-row gap-6 font-sans">
      {/* Sidebar de Controle */}
      <aside className="w-full md:w-80 bg-zinc-900 p-6 rounded-3xl shadow-2xl shadow-black/50 border border-white/5 flex flex-col gap-6 shrink-0 md:h-[calc(100vh-3rem)] md:sticky md:top-6 overflow-y-auto custom-scrollbar">
        <h1 className="text-2xl font-black flex items-center gap-3 text-white tracking-tight">
          <Layers className="text-indigo-400" size={28} /> Editor de Carrossel
        </h1>
        
        <div className="space-y-5 pt-5 border-t border-white/10">
          <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
            <Settings2 size={16} /> Configurações Globais
          </h3>

          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Fonte Principal</label>
            <div className="relative mb-2">
              <select 
                value={globalFont} 
                onChange={(e) => setGlobalFont(e.target.value)}
                className="w-full bg-zinc-950 p-3.5 rounded-xl border border-white/10 text-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all appearance-none"
              >
                <option value="Bebas Neue Pro">Bebas Neue Pro</option>
                <option value="Bebas Neue Regular">Bebas Neue Regular</option>
                <option value="Organetto Bold">Organetto Bold</option>
              </select>
              <TypeIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={18} />
            </div>
            
            {globalFont === 'Organetto Bold' && (
              <div className="mt-3">
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  className="hidden"
                  ref={fontInputRef}
                  onChange={handleFontUpload}
                />
                <button
                  onClick={() => fontInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl text-sm font-medium text-zinc-300 transition-all flex items-center justify-center gap-2"
                >
                  <Upload size={16} />
                  {customFontUrl ? 'Trocar arquivo da fonte' : 'Fazer upload da fonte (.ttf/.otf)'}
                </button>
                {customFontUrl && (
                  <p className="text-xs text-emerald-400 mt-2 text-center">
                    ✓ Fonte personalizada carregada
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Cor do Fundo (Sombra)</label>
            <div className="relative">
              <select 
                value={overlayColor} 
                onChange={(e) => setOverlayColor(e.target.value)}
                className="w-full bg-zinc-950 p-3.5 rounded-xl border border-white/10 text-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all appearance-none"
              >
                <option value="#000000">Preto Puro (#000000)</option>
                <option value="#030303">Preto Suave 1 (#030303)</option>
                <option value="#050505">Preto Suave 2 (#050505)</option>
                <option value="#080808">Preto Suave 3 (#080808)</option>
                <option value="#0a0a0a">Preto Suave 4 (#0a0a0a)</option>
              </select>
              <Layers className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={18} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Proporção do Carrossel</label>
            <div className="relative">
              <select 
                value={aspectRatio} 
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full bg-zinc-950 p-3.5 rounded-xl border border-white/10 text-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all appearance-none"
              >
                <option value="1080x1350">1080x1350 (Retrato)</option>
                <option value="1080x1346">1080x1346</option>
              </select>
              <LayoutTemplate className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={18} />
            </div>
          </div>
        </div>

        <div className="space-y-5 pt-5 border-t border-white/10">
          <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-bold text-zinc-200">Marca d'água (Logo)</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={showLogo} onChange={() => setShowLogo(!showLogo)} />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => logoInputRef.current?.click()}
                className="w-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 p-3.5 rounded-xl text-sm text-zinc-200 flex items-center justify-center gap-2 transition-colors font-medium shadow-sm"
              >
                <ImageIcon size={18} className="text-indigo-400" /> {logoImage ? 'Trocar Imagem da Logo' : 'Enviar Imagem da Logo'}
              </button>
              {logoImage && (
                <button
                  onClick={removeLogo}
                  className="w-full p-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} /> Remover Logo Atual
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-4 text-center">Se nenhuma imagem for enviada, o texto padrão será usado.</p>
            <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
          </div>

          <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4">
            <label className="text-xs font-bold text-zinc-400 block mb-2 uppercase tracking-wider">Rodapé Padrão</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="flex-1 bg-zinc-900 p-2.5 rounded-lg border border-white/10 text-zinc-200 text-sm focus:border-indigo-500 outline-none transition-colors"
                placeholder="Texto do rodapé"
              />
              <input 
                type="number" 
                value={footerFontSize}
                onChange={(e) => setFooterFontSize(Number(e.target.value))}
                className="w-16 bg-zinc-900 border border-white/10 rounded-lg p-2.5 text-sm text-center text-zinc-200 outline-none focus:border-indigo-500"
                title="Tamanho da Fonte"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-5 border-t border-white/10">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-white/5 hover:bg-white/10 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors border border-white/10 text-white"
          >
            <Plus size={20} /> Adicionar Slides
          </button>
          {slides.length > 0 && (
            <button 
              onClick={() => setSlides([])}
              className="w-full bg-red-500/10 hover:bg-red-500/20 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors border border-red-500/20 text-red-400"
            >
              <Trash2 size={20} /> Apagar Todos os Slides
            </button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            className="hidden" 
            accept="image/*" 
            multiple 
          />
        </div>

        <div className="mt-auto pt-6">
          <button 
            onClick={handleExport}
            disabled={slides.length === 0 || isExporting || slides.some(s => s.loading)}
            className="w-full bg-indigo-500 hover:bg-indigo-400 text-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            {isExporting ? (
              <><Loader2 size={20} className="animate-spin" /> Baixando...</>
            ) : (
              <><Download size={20} /> Baixar Imagens</>
            )}
          </button>
          <p className="text-xs text-zinc-500 text-center mt-4 font-medium">
            {slides.length} slide(s) prontos para exportação
          </p>
        </div>
      </aside>

      {/* Área de Visualização (Scroll Horizontal) */}
      <main className="w-full md:flex-1 bg-zinc-900/30 rounded-3xl border border-white/5 p-6 md:p-8 overflow-hidden flex flex-col md:h-[calc(100vh-3rem)] relative">
        {slides.length > 0 ? (
          <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar pb-6">
            <div className="flex flex-row gap-8 h-full items-center px-4 w-max">
              <AnimatePresence mode="popLayout">
                {slides.map((slide, index) => (
                  <SlideCard 
                    key={slide.id} 
                    slide={slide} 
                    index={index}
                    dimensions={dimensions} 
                    logoImage={logoImage}
                    showLogo={showLogo}
                    footerText={footerText}
                    footerFontSize={footerFontSize}
                    globalFont={globalFont}
                    overlayColor={overlayColor}
                    customFontUrl={customFontUrl}
                    onRemove={() => removeSlide(slide.id)}
                    onUpdate={(updates) => handleUpdateSlide(slide.id, updates)}
                    onApplyStyleToAll={() => handleApplyStyleToAll(slide)}
                    canvasRef={(el) => {
                      if (el) canvasRefs.current.set(slide.id, el);
                      else canvasRefs.current.delete(slide.id);
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-32 h-32 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mb-2 shadow-2xl"
            >
              <ImageIcon size={56} className="text-indigo-500/50" />
            </motion.div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Nenhum slide adicionado</h2>
            <p className="max-w-md text-center text-zinc-400 text-lg leading-relaxed">
              Clique em <span className="text-indigo-400 font-semibold">Adicionar Slides</span> no painel lateral para começar a montar o seu carrossel.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

// Função auxiliar para quebrar o texto em linhas antes de desenhar
const getLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (let p = 0; p < paragraphs.length; p++) {
    const words = paragraphs[p].split(' ');
    let line = '';

    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const cleanTestLine = testLine.replace(/\*/g, '');
      const metrics = ctx.measureText(cleanTestLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      }
      else {
        line = testLine;
      }
    }
    lines.push(line);
  }
  return lines;
};

const drawColoredText = (
  ctx: CanvasRenderingContext2D, 
  line: string, 
  centerX: number, 
  y: number, 
  textColor: string,
  highlightColor: string,
  initialHighlight: boolean = false
): boolean => {
  const chunks: {text: string, isHighlight: boolean}[] = [];
  let currentText = '';
  let isHighlight = initialHighlight;
  
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '*') {
      if (currentText) {
        chunks.push({ text: currentText, isHighlight });
        currentText = '';
      }
      isHighlight = !isHighlight;
    } else {
      currentText += line[i];
    }
  }
  if (currentText) {
    chunks.push({ text: currentText, isHighlight });
  }

  let totalWidth = 0;
  chunks.forEach(chunk => {
    totalWidth += ctx.measureText(chunk.text).width;
  });

  let currentX = centerX - totalWidth / 2;
  ctx.textAlign = 'left'; 
  
  chunks.forEach(chunk => {
    ctx.fillStyle = chunk.isHighlight ? highlightColor : textColor;
    ctx.fillText(chunk.text, currentX, y);
    currentX += ctx.measureText(chunk.text).width;
  });
  
  ctx.textAlign = 'center'; 
  return isHighlight;
};

interface SlideCardProps {
  slide: Slide; 
  index: number;
  dimensions: { width: number; height: number }; 
  logoImage: string | null;
  showLogo: boolean;
  footerText: string;
  footerFontSize: number;
  globalFont: string;
  overlayColor: string;
  customFontUrl: string | null;
  onRemove: () => void; 
  onUpdate: (updates: Partial<Slide>) => void;
  onApplyStyleToAll: () => void;
  canvasRef: (el: HTMLCanvasElement | null) => void;
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

const SlideCard: React.FC<SlideCardProps> = ({ 
  slide, 
  index,
  dimensions, 
  logoImage,
  showLogo,
  footerText,
  footerFontSize,
  globalFont,
  overlayColor,
  customFontUrl,
  onRemove, 
  onUpdate,
  onApplyStyleToAll,
  canvasRef 
}) => {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  const textBBox = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const [dragState, setDragState] = useState<{ 
    isDragging: boolean, 
    startX: number,
    startY: number, 
    initialTextOffsetX: number,
    initialTextOffsetY: number
  } | null>(null);

  // Cache das imagens para evitar recarregamento no canvas a cada frame
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [watermarkImg, setWatermarkImg] = useState<HTMLImageElement | null>(null);
  
  const [isImageControlsOpen, setIsImageControlsOpen] = useState(false);
  const [isFooterControlsOpen, setIsFooterControlsOpen] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = slide.image;
  }, [slide.image]);

  useEffect(() => {
    if (!logoImage) {
      setWatermarkImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setWatermarkImg(img);
    img.onerror = () => setWatermarkImg(null);
    img.src = logoImage;
  }, [logoImage]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = internalRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const bbox = textBBox.current;
    const padding = 60; // Área de toque maior para facilitar no mobile

    // Verifica se o toque foi dentro da área do texto
    if (
      x >= bbox.x - padding &&
      x <= bbox.x + bbox.width + padding &&
      y >= bbox.y - padding &&
      y <= bbox.y + bbox.height + padding
    ) {
      setDragState({
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initialTextOffsetX: slide.offsetX || 0,
        initialTextOffsetY: slide.offsetY || 0
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = internalRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (!dragState?.isDragging) {
      // Atualiza o cursor se estiver sobre o texto
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const bbox = textBBox.current;
      const padding = 40;
      if (
        x >= bbox.x - padding && x <= bbox.x + bbox.width + padding &&
        y >= bbox.y - padding && y <= bbox.y + bbox.height + padding
      ) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'auto';
      }
      return;
    }
    
    const deltaX = (e.clientX - dragState.startX) * scaleX;
    const deltaY = (e.clientY - dragState.startY) * scaleY;
    
    onUpdate({ 
      offsetX: dragState.initialTextOffsetX + deltaX,
      offsetY: dragState.initialTextOffsetY + deltaY
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDragState(null);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Previne o scroll da página apenas se o usuário tocar no texto
  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas) return;
    
    const handleTouchStart = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * scaleX;
      const y = (touch.clientY - rect.top) * scaleY;
      
      const bbox = textBBox.current;
      const padding = 60; // Área de toque
      if (
        x >= bbox.x - padding && x <= bbox.x + bbox.width + padding &&
        y >= bbox.y - padding && y <= bbox.y + bbox.height + padding
      ) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => canvas.removeEventListener('touchstart', handleTouchStart);
  }, []);

  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas || !bgImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    document.fonts.ready.then(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const getFontString = (size: number) => {
        switch (globalFont) {
          case 'Bebas Neue Regular':
            return `normal ${size}px "Bebas Neue", sans-serif`;
          case 'Organetto Bold':
            return `bold ${size}px ${customFontUrl ? '"CustomOrganetto"' : '"Organetto Bold"'}, "Montserrat", sans-serif`;
          case 'Bebas Neue Pro':
          default:
            return `bold ${size}px "Bebas Neue", sans-serif`;
        }
      };

      // 1. Desenha a imagem de fundo (cover)
      const img = bgImage;
      const logoImg = showLogo ? watermarkImg : null;

      const baseScale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const scale = baseScale * (slide.imageScale || 1);
      const x = (canvas.width / 2) - (img.width / 2) * scale + (slide.imageOffsetX || 0);
      const y = (canvas.height / 2) - (img.height / 2) * scale + (slide.imageOffsetY || 0);
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      
      // 3. Cálculos de Agrupamento (Marca d'água + Texto)
        ctx.font = getFontString(slide.fontSize);
        const maxWidth = canvas.width * (slide.textWidth || 0.85);
        const lines = slide.text ? getLines(ctx, slide.text.toUpperCase(), maxWidth) : [];
        const lineHeight = slide.fontSize * 1.05;
        const textHeight = lines.length * lineHeight;
        
        const logoHeight = 50; // Altura fixa para o logo
        const logoWidth = logoImg ? (logoImg.width / logoImg.height) * logoHeight : 0;
        
        const watermarkHeight = showLogo ? logoHeight : 0;
        const gap = showLogo && slide.text ? 20 : 0;
        const totalGroupHeight = watermarkHeight + gap + textHeight;

        // Limitar o offsetY e offsetX para não sair da tela
        const maxOffsetY = canvas.height * 0.4;
        const maxOffsetX = canvas.width * 0.4;
        const clampedOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, slide.offsetY || 0));
        const clampedOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, slide.offsetX || 0));

        // Posição base ancorada na parte inferior, ajustada pelo offset do usuário
        const groupCenterX = canvas.width / 2 + clampedOffsetX;
        const groupBottomY = canvas.height * 0.88 + clampedOffsetY;
        let currentY = groupBottomY - totalGroupHeight;
        const groupTop = currentY;

        // 2. Sombra/Gradiente Escuro para esconder o texto original (suavizado)
        const solidStart = groupTop + 60; // Começa o preto sólido mais abaixo para cobrir bem
        const gradientHeight = 400; // Altura do degradê muito maior para transição suave
        const gradientStart = solidStart - gradientHeight;

        const rgb = hexToRgb(overlayColor);
        const colorBase = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

        const gradient = ctx.createLinearGradient(0, gradientStart, 0, solidStart);
        // Múltiplos color stops para criar uma curva de easing natural (não linear)
        gradient.addColorStop(0, `rgba(${colorBase}, 0)`);
        gradient.addColorStop(0.3, `rgba(${colorBase}, 0.1)`);
        gradient.addColorStop(0.6, `rgba(${colorBase}, 0.4)`);
        gradient.addColorStop(0.8, `rgba(${colorBase}, 0.7)`);
        gradient.addColorStop(1, `rgba(${colorBase}, 1)`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, gradientStart, canvas.width, gradientHeight);
        
        // Preenchimento sólido na parte inferior
        ctx.fillStyle = overlayColor;
        ctx.fillRect(0, solidStart, canvas.width, canvas.height - solidStart);

        // 4. Desenha a Marca d'água (Logo ou Texto Padrão)
        if (showLogo) {
          let logoDrawWidth = 0;
          
          if (logoImg) {
            const logoX = groupCenterX - logoWidth / 2;
            ctx.drawImage(logoImg, logoX, currentY, logoWidth, logoHeight);
            logoDrawWidth = logoWidth;
          } else {
            // Fallback para texto se não houver imagem
            ctx.fillStyle = 'white';
            ctx.font = 'italic 50px "Times New Roman", serif'; // Ajuste para parecer mais com a logo
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText("Mental Firme", groupCenterX, currentY);
            logoDrawWidth = ctx.measureText("Mental Firme").width;
          }

          // Linhas laterais da marca d'água
          const linePadding = 30;
          const lineWidth = 250; 
          const lineY = currentY + (logoHeight / 2);
          
          ctx.beginPath();
          ctx.moveTo(groupCenterX - logoDrawWidth / 2 - linePadding - lineWidth, lineY);
          ctx.lineTo(groupCenterX - logoDrawWidth / 2 - linePadding, lineY);
          ctx.moveTo(groupCenterX + logoDrawWidth / 2 + linePadding, lineY);
          ctx.lineTo(groupCenterX + logoDrawWidth / 2 + linePadding + lineWidth, lineY);
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.stroke();

          currentY += logoHeight + gap;
        }
        
        // 5. Desenha o Texto Principal
        if (slide.text) {
          ctx.fillStyle = '#ffef58'; // Cor padrão original
          ctx.font = getFontString(slide.fontSize);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          
          // Sombra para garantir legibilidade e profundidade
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;

          const textStartY = currentY;
          let actualMaxWidth = 0;
          let currentHighlight = false;

          lines.forEach((line) => {
            const cleanLine = line.trim().replace(/\*/g, '');
            const lineWidth = ctx.measureText(cleanLine).width;
            if (lineWidth > actualMaxWidth) actualMaxWidth = lineWidth;
            
            currentHighlight = drawColoredText(
              ctx, 
              line.trim(), 
              groupCenterX, 
              currentY, 
              slide.textColor || '#ffffff',
              slide.highlightColor || '#ffef58', 
              currentHighlight
            );
            currentY += lineHeight;
          });
          
          // Atualiza a bounding box do texto para detecção de clique/toque
          textBBox.current = {
            x: groupCenterX - (actualMaxWidth / 2),
            y: textStartY,
            width: actualMaxWidth,
            height: textHeight
          };

          // Reset shadow
          ctx.shadowColor = 'transparent';
        } else {
          textBBox.current = { x: 0, y: 0, width: 0, height: 0 };
        }

        // 6. Desenha o Rodapé
        if (footerText && slide.showFooter !== false) {
          ctx.fillStyle = 'white';
          ctx.font = getFontString(footerFontSize);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(footerText, canvas.width / 2, canvas.height * 0.96);
        }

        // 7. Desenha as Guias (APENAS DURANTE O ARRASTO)
        if (dragState?.isDragging) {
          ctx.strokeStyle = '#66FCF1'; // Cyan guide lines
          ctx.lineWidth = 3;
          ctx.setLineDash([15, 15]); 
          
          // Linha vertical central
          ctx.beginPath();
          ctx.moveTo(canvas.width / 2, 0);
          ctx.lineTo(canvas.width / 2, canvas.height);
          ctx.stroke();

          // Linha horizontal central
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
          
          ctx.setLineDash([]); // Reset
        }
    });
  }, [slide, dimensions, logoImage, showLogo, footerText, footerFontSize, dragState?.isDragging, bgImage, watermarkImg]);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="w-[85vw] max-w-[380px] md:w-[420px] md:max-w-none shrink-0 bg-zinc-900 border border-white/10 rounded-3xl p-5 flex flex-col gap-5 relative group shadow-2xl h-full overflow-y-auto custom-scrollbar"
    >
      <div className="flex justify-between items-center px-1">
        <span className="text-sm font-black text-white tracking-wider uppercase bg-white/10 px-3 py-1 rounded-full">Slide {index + 1}</span>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              const canvas = internalRef.current;
              if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `slide-${index + 1}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            }}
            className="text-zinc-400 hover:text-indigo-400 hover:bg-indigo-400/10 transition-colors p-2 rounded-xl"
            title="Baixar slide"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={onRemove}
            className="text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors p-2 rounded-xl"
            title="Remover slide"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div 
        className="relative w-full rounded-2xl overflow-hidden bg-zinc-950 flex items-center justify-center border border-white/5 shadow-inner shrink-0" 
        style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}
      >
        <canvas 
          id={`canvas-${slide.id}`}
          ref={(el) => {
            internalRef.current = el;
            canvasRef(el);
          }}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full object-contain"
          style={{ 
            cursor: dragState?.isDragging ? 'grabbing' : 'auto'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        
        {slide.loading && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-indigo-500" size={40} />
            <span className="text-sm font-bold text-indigo-400 tracking-widest uppercase">Analisando...</span>
          </div>
        )}
      </div>

      {/* Controles de Edição do Slide */}
      <div className="space-y-5 pb-2">
        {/* Controles de Texto */}
        <div className="flex flex-col gap-4 bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <TypeIcon size={14} /> Texto Principal
            </label>
            <div className="flex gap-2 items-center">
              <button 
                onClick={() => onUpdate({ offsetX: 0 })}
                className="text-xs bg-zinc-900 hover:bg-white/10 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-white/5"
                title="Centralizar texto horizontalmente"
              >
                <AlignCenter size={12} /> Centralizar
              </button>
              <button 
                onClick={onApplyStyleToAll}
                className="text-xs bg-zinc-900 hover:bg-white/10 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-white/5"
                title="Aplicar tamanho e posição a todos os slides"
              >
                <Layers size={12} /> Aplicar a Todos
              </button>
            </div>
          </div>
          
          <div>
            <textarea
              value={slide.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              placeholder="Digite o texto principal aqui..."
              className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3.5 text-sm text-zinc-200 focus:border-indigo-500 outline-none resize-none h-24 transition-colors"
            />
            <div className="flex flex-col gap-3 mt-3">
              <p className="text-[10px] text-zinc-500">Dica: Envolva palavras com *asteriscos* para aplicar a cor de destaque.</p>
              
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cor Principal</label>
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/10 rounded-lg p-1.5">
                    <input 
                      type="color" 
                      value={slide.textColor || '#ffffff'} 
                      onChange={(e) => onUpdate({ textColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                      title="Cor do Texto"
                    />
                    <input
                      type="text"
                      value={slide.textColor || '#ffffff'}
                      onChange={(e) => onUpdate({ textColor: e.target.value })}
                      className="w-16 bg-transparent text-xs font-mono text-zinc-300 outline-none uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cor de Destaque</label>
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/10 rounded-lg p-1.5">
                    <input 
                      type="color" 
                      value={slide.highlightColor || '#ffef58'} 
                      onChange={(e) => onUpdate({ highlightColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                      title="Cor de Destaque"
                    />
                    <input
                      type="text"
                      value={slide.highlightColor || '#ffef58'}
                      onChange={(e) => onUpdate({ highlightColor: e.target.value })}
                      className="w-16 bg-transparent text-xs font-mono text-zinc-300 outline-none uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 flex items-center justify-between">
              <span>Tamanho da Fonte</span>
              <button
                onClick={() => onUpdate({ offsetX: 0, offsetY: 0, fontSize: 84 })}
                className="text-[10px] text-zinc-500 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                title="Resetar Posição e Tamanho"
              >
                <RotateCcw size={12} /> Resetar
              </button>
            </label>
            <div className="flex items-center gap-3">
              <input 
                type="range" 
                min="40" 
                max="150" 
                value={slide.fontSize} 
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="flex-1 accent-indigo-500"
              />
              <input 
                type="number" 
                min="40" 
                max="150" 
                value={slide.fontSize} 
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="w-16 bg-zinc-900 border border-white/10 rounded-lg p-1.5 text-sm text-center text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 flex items-center justify-between">
              <span>Largura do Texto (Quebra de Linha)</span>
            </label>
            <div className="flex items-center gap-3">
              <input 
                type="range" 
                min="0.4" 
                max="1.0" 
                step="0.01"
                value={slide.textWidth || 0.85} 
                onChange={(e) => onUpdate({ textWidth: Number(e.target.value) })}
                className="flex-1 accent-indigo-500"
              />
              <div className="w-16 bg-zinc-900 border border-white/10 rounded-lg p-1.5 text-sm text-center text-zinc-200 flex items-center justify-center">
                {Math.round((slide.textWidth || 0.85) * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Controles da Imagem */}
        <div className="flex flex-col gap-4 bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <ImageIcon size={14} /> Recorte da Imagem
            </label>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => onUpdate({ imageOffsetX: 0, imageOffsetY: 0 })}
                className="text-xs bg-zinc-900 hover:bg-white/10 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-white/5"
                title="Centralizar imagem"
              >
                <AlignCenter size={12} /> Centralizar
              </button>
              <button 
                onClick={() => onUpdate({ imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 })}
                className="text-xs bg-zinc-900 hover:bg-white/10 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-white/5"
                title="Reiniciar recortes"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-4 pt-2 border-t border-white/5">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-medium text-zinc-400">Zoom</label>
                <span className="text-xs text-zinc-500">{slide.imageScale?.toFixed(2) || '1.00'}x</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => onUpdate({ imageScale: Math.max(0.5, (slide.imageScale || 1) - 0.05) })} className="text-zinc-400 hover:text-white"><Minus size={16}/></button>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3" 
                  step="0.05"
                  value={slide.imageScale || 1} 
                  onChange={(e) => onUpdate({ imageScale: Number(e.target.value) })}
                  className="flex-1 accent-indigo-500"
                />
                <button onClick={() => onUpdate({ imageScale: Math.min(3, (slide.imageScale || 1) + 0.05) })} className="text-zinc-400 hover:text-white"><Plus size={16}/></button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Posição X</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => onUpdate({ imageOffsetX: (slide.imageOffsetX || 0) - 10 })} className="text-zinc-400 hover:text-white"><Minus size={16}/></button>
                  <input 
                    type="range" 
                    min="-1000" 
                    max="1000" 
                    value={slide.imageOffsetX || 0} 
                    onChange={(e) => onUpdate({ imageOffsetX: Number(e.target.value) })}
                    className="flex-1 accent-indigo-500"
                  />
                  <button onClick={() => onUpdate({ imageOffsetX: (slide.imageOffsetX || 0) + 10 })} className="text-zinc-400 hover:text-white"><Plus size={16}/></button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Posição Y</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => onUpdate({ imageOffsetY: (slide.imageOffsetY || 0) - 10 })} className="text-zinc-400 hover:text-white"><Minus size={16}/></button>
                  <input 
                    type="range" 
                    min="-1000" 
                    max="1000" 
                    value={slide.imageOffsetY || 0} 
                    onChange={(e) => onUpdate({ imageOffsetY: Number(e.target.value) })}
                    className="flex-1 accent-indigo-500"
                  />
                  <button onClick={() => onUpdate({ imageOffsetY: (slide.imageOffsetY || 0) + 10 })} className="text-zinc-400 hover:text-white"><Plus size={16}/></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle de Rodapé */}
        <div className="flex flex-col gap-4 bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              Rodapé
            </label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={slide.showFooter !== false} 
                onChange={() => onUpdate({ showFooter: slide.showFooter === false ? true : false })} 
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
