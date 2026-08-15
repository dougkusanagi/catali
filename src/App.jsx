import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { useDropzone } from "react-dropzone";
import { NumberFormatBase } from "react-number-format";
import {
  Archive as ArchiveIcon,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  Copy as CopyIcon,
  Download,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  LoaderCircle,
  Plus as PlusIcon,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import "./index.css";

const emptyStore = {
  id: 1,
  name: "Crônicas",
  logoPath: "/logo-cronicas.png",
  defaultTheme: "brutalista",
  defaultPalette: "energia",
};

const emptyPromotion = {
  id: null,
  storeId: 1,
  version: 1,
  title: "Ofertas da semana",
  subtitle: "Preço de atacado para você economizar de verdade",
  note: "Ofertas válidas enquanto durarem os estoques",
  badgeText: "ATACADO",
  hashtag: "#VEMPROCRÔNICAS",
  startsAt: null,
  endsAt: null,
  status: "draft",
  theme: "brutalista",
  palette: "energia",
  store: emptyStore,
  pages: [{ id: "page-draft", position: 0, grid: "classic", products: [] }],
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const urlParams = new URLSearchParams(window.location.search);
const isPrintMode = urlParams.has("print");
const printPromotionId = urlParams.get("promotion");
const printPageNumber = Number(urlParams.get("page") || 0);
const isCoverMode = urlParams.get("export") === "cover";
const MAX_PRODUCTS = 24;
const GRID_LIMITS = { classic: 6, "feature-left": 5, "feature-top": 7 };
const GRID_LABELS = {
  classic: "Clássico · 2 colunas",
  "feature-left": "Destaque à esquerda",
  "feature-top": "Destaque no topo",
};
const STATUS_LABELS = {
  draft: "Rascunho",
  published: "Publicada",
  ended: "Encerrada",
  archived: "Arquivada",
};
const THEMES = [
  { id: "brutalista", name: "Brutalista", description: "Contraste e personalidade" },
  { id: "varejo", name: "Varejo", description: "Preço em primeiro lugar" },
  { id: "suave", name: "Suave", description: "Acolhedor e refinado" },
];
const PALETTES = [
  { id: "energia", name: "Energia", colors: ["#f20b0b", "#d7a52b", "#fff7e9"] },
  { id: "oceano", name: "Oceano", colors: ["#07689f", "#45b3c7", "#effbff"] },
  { id: "natural", name: "Natural", colors: ["#356859", "#e6b655", "#f6f0df"] },
  { id: "noturno", name: "Noturno", colors: ["#f3a712", "#ef476f", "#201b2c"] },
];
const PRODUCT_IMAGE_ASPECT = 1;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRICE_REQUIRED_MESSAGE = "Preencha o preço de atacado de todos os produtos.";
const DRAFT_STORAGE_KEY = "cronicas-promo-draft";
const TAB_ID_STORAGE_KEY = "cronicas-promo-tab-id";

function formatPrice(cents) {
  return money.format((Number(cents) || 0) / 100);
}

function formatCentsInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  const normalized = digits.replace(/^0+(?=\d)/, "").padStart(3, "0");
  const integerPart = normalized.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${integerPart},${normalized.slice(-2)}`;
}

async function fetchJsonWithRetry(url, options, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      return { response, data: await response.json() };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }
  throw lastError;
}

function createDraftId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function promotionProducts(promotion) {
  return (promotion?.pages || []).flatMap((page) => page.products || []);
}

function normalizePages(data) {
  if (Array.isArray(data?.pages) && data.pages.length > 0) {
    return data.pages.map((page, pageIndex) => ({
      ...page,
      id: page.id || `page-${pageIndex + 1}`,
      position: pageIndex,
      grid: GRID_LIMITS[page.grid] ? page.grid : "classic",
      products: (page.products || []).map((product, productIndex) => ({
        ...product,
        id: product.id || createDraftId(),
        position: productIndex,
        name: product.name || "",
        isHighlighted: Boolean(product.isHighlighted),
      })),
    }));
  }
  const products = Array.isArray(data?.products) ? data.products : [];
  const pages = [];
  for (
    let index = 0;
    index < Math.max(1, Math.ceil(products.length / GRID_LIMITS.classic));
    index += 1
  ) {
    pages.push({
      id: `page-${index + 1}`,
      position: index,
      grid: "classic",
      products: products.slice(index * 6, index * 6 + 6).map((product, productIndex) => ({
        ...product,
        id: product.id || createDraftId(),
        position: productIndex,
        name: product.name || "",
        isHighlighted: Boolean(product.isHighlighted),
      })),
    });
  }
  return pages;
}

function normalizePromotion(data) {
  return {
    ...emptyPromotion,
    ...data,
    version: Number(data?.version) || 1,
    theme: data?.theme || data?.store?.defaultTheme || emptyPromotion.theme,
    palette: data?.palette || data?.store?.defaultPalette || emptyPromotion.palette,
    store: { ...emptyStore, ...(data?.store || {}) },
    pages: normalizePages(data),
  };
}

function conflictDetails(localPromotion, latestPromotion) {
  const fields = [
    ["title", "título"],
    ["subtitle", "chamada"],
    ["badgeText", "selo"],
    ["hashtag", "hashtag"],
    ["note", "rodapé"],
    ["theme", "tema"],
    ["palette", "paleta"],
  ];
  const changedFields = fields
    .filter(([field]) => localPromotion[field] !== latestPromotion[field])
    .map(([, label]) => label);
  const productsChanged =
    JSON.stringify(localPromotion.pages) !== JSON.stringify(latestPromotion.pages);
  return productsChanged ? [...changedFields, "produtos"] : changedFields;
}

function ConflictDialog({
  latestPromotion,
  localPromotion,
  onUseRemote,
  onApplyDraft,
  onKeepDraft,
}) {
  const details = conflictDetails(localPromotion, latestPromotion);
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <section className="conflict-dialog">
        <div className="conflict-icon">
          <RefreshCw size={23} />
        </div>
        <span className="eyebrow">VERSÃO MAIS RECENTE ENCONTRADA</span>
        <h2 id="conflict-title">Seu rascunho divergiu da promoção salva</h2>
        <p>
          A versão {latestPromotion.version} já está no banco; seu rascunho continua aberto na
          versão
          {localPromotion.version}. Nada foi perdido.
        </p>
        {details.length > 0 && (
          <p className="conflict-details">
            Divergências encontradas: <strong>{details.join(", ")}.</strong>
          </p>
        )}
        <div className="conflict-actions">
          <button className="button ghost" type="button" onClick={onKeepDraft}>
            Continuar revisando
          </button>
          <button className="button ghost" type="button" onClick={onUseRemote}>
            Usar versão salva
          </button>
          <button className="button primary" type="button" onClick={onApplyDraft}>
            Aplicar meu rascunho
          </button>
        </div>
      </section>
    </div>
  );
}

const getRadianAngle = (degree) => (degree * Math.PI) / 180;

function rotatedCanvasSize(width, height, rotation) {
  const angle = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * height),
    height: Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * height),
  };
}

function minimumCropZoom(mediaSize, cropSize, rotation) {
  if (!mediaSize || !cropSize || mediaSize.width <= 0 || mediaSize.height <= 0) return 1;
  const rotated = rotatedCanvasSize(mediaSize.width, mediaSize.height, rotation);
  return Math.max(1, cropSize.width / rotated.width, cropSize.height / rotated.height);
}

function createCroppedPhoto(source, pixelCrop, rotation, flip) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const rotated = rotatedCanvasSize(image.naturalWidth, image.naturalHeight, rotation);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rotated.width);
      canvas.height = Math.round(rotated.height);
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Não foi possível preparar a imagem."));
        return;
      }
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(getRadianAngle(rotation));
      context.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
      context.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
      context.drawImage(image, 0, 0);

      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = Math.round(pixelCrop.width);
      croppedCanvas.height = Math.round(pixelCrop.height);
      const croppedContext = croppedCanvas.getContext("2d");
      if (!croppedContext) {
        reject(new Error("Não foi possível recortar a imagem."));
        return;
      }
      croppedContext.drawImage(
        canvas,
        Math.round(pixelCrop.x),
        Math.round(pixelCrop.y),
        croppedCanvas.width,
        croppedCanvas.height,
        0,
        0,
        croppedCanvas.width,
        croppedCanvas.height,
      );
      croppedCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Não foi possível exportar a imagem."));
            return;
          }
          resolve(new File([blob], "produto.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.9,
      );
    };
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = source;
  });
}

function ImageEditor({ source, onCancel, onDone, onRetake }) {
  const cropContainerRef = useRef(null);
  const mediaSizeRef = useRef(null);
  const cropSizeRef = useRef(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState({ horizontal: false, vertical: false });
  const [mediaSize, setMediaSize] = useState(null);
  const [cropContainerSize, setCropContainerSize] = useState(null);
  const [cropSize, setCropSize] = useState(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const minZoom = useMemo(
    () => minimumCropZoom(mediaSize, cropSize, rotation),
    [mediaSize, cropSize, rotation],
  );

  useEffect(() => {
    const container = cropContainerRef.current;
    if (!container) return undefined;
    const updateSize = () =>
      setCropContainerSize({ width: container.clientWidth, height: container.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function handleMediaLoaded(nextMediaSize) {
    mediaSizeRef.current = nextMediaSize;
    setMediaSize(nextMediaSize);
    setZoom((current) =>
      Math.max(current, minimumCropZoom(nextMediaSize, cropSizeRef.current, rotation)),
    );
  }

  function handleCropSizeChange(nextCropSize) {
    cropSizeRef.current = nextCropSize;
    setCropSize(nextCropSize);
    setZoom((current) =>
      Math.max(current, minimumCropZoom(mediaSizeRef.current, nextCropSize, rotation)),
    );
  }

  function rotateCrop(degrees) {
    const nextRotation = rotation + degrees;
    setRotation(nextRotation);
    setZoom((current) =>
      Math.max(current, minimumCropZoom(mediaSizeRef.current, cropSizeRef.current, nextRotation)),
    );
  }

  function resetCrop() {
    setCrop({ x: 0, y: 0 });
    setRotation(0);
    setZoom(minimumCropZoom(mediaSizeRef.current, cropSizeRef.current, 0));
    setFlip({ horizontal: false, vertical: false });
    setCroppedAreaPixels(null);
  }

  async function finish() {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      await onDone(await createCroppedPhoto(source, croppedAreaPixels, rotation, flip));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editar imagem">
      <section className="image-editor">
        <div className="editor-title">
          <div>
            <span className="eyebrow">AJUSTAR FOTO</span>
            <h2>Ajuste a imagem</h2>
          </div>
          <button className="editor-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        <div ref={cropContainerRef} className="crop-stage">
          <Cropper
            image={source}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={PRODUCT_IMAGE_ASPECT}
            cropSize={cropContainerSize ?? undefined}
            minZoom={minZoom}
            maxZoom={5}
            objectFit="contain"
            zoomWithScroll
            zoomSpeed={0.35}
            showGrid
            roundCropAreaPixels
            onCropChange={setCrop}
            onCropComplete={(_, nextPixels) => setCroppedAreaPixels(nextPixels)}
            onZoomChange={setZoom}
            onMediaLoaded={handleMediaLoaded}
            onCropSizeChange={handleCropSizeChange}
            transform={`translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${zoom}) scaleX(${flip.horizontal ? -1 : 1}) scaleY(${flip.vertical ? -1 : 1})`}
            classes={{ cropAreaClassName: "crop-area" }}
            cropperProps={{ "aria-label": "Área de recorte da foto" }}
          />
        </div>
        <div className="editor-controls">
          <p className="gesture-hint gesture-hint-desktop">
            Role o mouse sobre a imagem para aproximar ou afastar
          </p>
          <p className="gesture-hint gesture-hint-mobile">
            Use dois dedos para aproximar ou afastar
          </p>
          <div className="crop-tools">
            <button onClick={() => rotateCrop(-90)} title="Girar para a esquerda">
              <RotateCcw size={17} /> <span>Esquerda</span>
            </button>
            <button onClick={() => rotateCrop(90)} title="Girar para a direita">
              <RotateCw size={17} /> <span>Direita</span>
            </button>
            <button
              onClick={() =>
                setFlip((current) => ({ ...current, horizontal: !current.horizontal }))
              }
              title="Inverter horizontalmente"
            >
              <FlipHorizontal2 size={17} /> <span>Horizontal</span>
            </button>
            <button
              onClick={() => setFlip((current) => ({ ...current, vertical: !current.vertical }))}
              title="Inverter verticalmente"
            >
              <FlipVertical2 size={17} /> <span>Vertical</span>
            </button>
          </div>
          <button className="reset-crop" onClick={resetCrop}>
            <Undo2 size={17} /> Restaurar
          </button>
        </div>
        <div className="modal-actions">
          <button className="button ghost" onClick={onRetake}>
            Tirar outra foto
          </button>
          <button className="button primary" onClick={finish} disabled={busy || !croppedAreaPixels}>
            {busy ? <LoaderCircle className="spin" size={18} /> : null} Cortar e Salvar
          </button>
        </div>
      </section>
    </div>
  );
}

function ImagePreviewModal({ source, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop image-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar imagem do produto"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="image-preview-dialog">
        <button className="image-preview-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <img src={source} alt="Produto em tamanho real" />
      </section>
    </div>
  );
}

const PROMO_PALETTE_TOKENS = {
  energia: {
    red: "#f20b0b",
    gold: "#d7a52b",
    bg: "#fffdf8",
    surface: "#fff",
    text: "#171411",
    muted: "#6b5c4b",
  },
  oceano: {
    red: "#07689f",
    gold: "#45b3c7",
    bg: "#effbff",
    surface: "#fff",
    text: "#10364a",
    muted: "#426777",
  },
  natural: {
    red: "#356859",
    gold: "#e6b655",
    bg: "#f6f0df",
    surface: "#fffdf5",
    text: "#243b31",
    muted: "#657267",
  },
  noturno: {
    red: "#ef476f",
    gold: "#f3a712",
    bg: "#201b2c",
    surface: "#2d2740",
    text: "#fff8e8",
    muted: "#d7cce5",
  },
};

function promoStyle(promotion) {
  const colors = PROMO_PALETTE_TOKENS[promotion.palette] || PROMO_PALETTE_TOKENS.energia;
  const theme = promotion.theme || "brutalista";
  return {
    "--promo-red": colors.red,
    "--promo-gold": colors.gold,
    "--promo-bg": colors.bg,
    "--promo-surface": colors.surface,
    "--promo-text": colors.text,
    "--promo-muted": colors.muted,
    "--promo-radius": theme === "brutalista" ? "0" : theme === "varejo" ? "2mm" : "5mm",
    "--promo-shadow":
      theme === "suave" ? `0 2mm 7mm ${colors.gold}55` : `2.2mm 2.2mm 0 ${colors.gold}`,
  };
}

function PromoPage({ promotion, page, pageNumber, totalPages }) {
  const products = page.products || [];
  const logoPath = promotion.store?.logoPath;
  return (
    <article
      className={`promo-page theme-${promotion.theme} palette-${promotion.palette}`}
      style={promoStyle(promotion)}
    >
      <div className="page-orbit orbit-one" />
      <div className="page-orbit orbit-two" />
      <header className="promo-header">
        <div className="logo-lockup">
          {logoPath ? (
            <img src={logoPath} alt={promotion.store?.name || "Loja"} />
          ) : (
            <strong className="logo-fallback">{promotion.store?.name || "Sua loja"}</strong>
          )}
        </div>
        <div className="headline">
          <span>{promotion.badgeText}</span>
          <h1>{promotion.title}</h1>
          <p>{promotion.subtitle}</p>
        </div>
      </header>
      <div
        className={`products-grid grid-${page.grid} count-${products.length}`}
        data-grid={page.grid}
      >
        {products.map((product, index) => (
          <div
            className={`product-offer ${product.isHighlighted ? "is-highlighted" : ""}`}
            key={product.id || `${pageNumber}-${index}`}
          >
            <div className="product-photo">
              <img src={product.imagePath} alt={product.name || "Produto em promoção"} />
            </div>
            {product.name && <span className="product-name">{product.name}</span>}
            <div className="price-sticker">
              <small>
                PREÇO DE
                <br />
                ATACADO
              </small>
              <strong>{formatPrice(product.wholesalePriceCents)}</strong>
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="empty-promo">
            <Sparkles size={42} />
            <strong>Suas ofertas vão aparecer aqui</strong>
            <span>Adicione fotos e preços no painel ao lado.</span>
          </div>
        )}
      </div>
      <footer className="promo-footer">
        <span>{promotion.note}</span>
        {totalPages > 1 && (
          <b>
            {pageNumber}/{totalPages}
          </b>
        )}
        <i>{promotion.hashtag}</i>
      </footer>
    </article>
  );
}

function PromoDocument({ promotion }) {
  const sourcePages = promotion.pages?.length
    ? promotion.pages
    : [{ id: "page-empty", position: 0, grid: "classic", products: [] }];
  const selectedPages = sourcePages
    .map((page, index) => ({ page, sourceIndex: index }))
    .filter(({ sourceIndex }) => printPageNumber <= 0 || sourceIndex + 1 === printPageNumber);
  const visiblePages = selectedPages.length
    ? selectedPages
    : [{ page: { id: "page-empty", position: 0, grid: "classic", products: [] }, sourceIndex: 0 }];
  return (
    <div className="promo-document">
      {visiblePages.map(({ page, sourceIndex }, index) => (
        <PromoPage
          key={page.id || index}
          promotion={promotion}
          page={page}
          pageNumber={sourceIndex + 1}
          totalPages={sourcePages.length}
        />
      ))}
    </div>
  );
}

function ShareCover({ promotion }) {
  const products = promotionProducts(promotion).slice(0, 4);
  const validity =
    promotion.startsAt || promotion.endsAt
      ? `${promotion.startsAt ? new Date(promotion.startsAt).toLocaleDateString("pt-BR") : ""}${promotion.startsAt && promotion.endsAt ? " — " : ""}${promotion.endsAt ? new Date(promotion.endsAt).toLocaleDateString("pt-BR") : ""}`
      : "Ofertas da semana";
  return (
    <article className={`share-cover theme-${promotion.theme}`} style={promoStyle(promotion)}>
      <header>
        {promotion.store?.logoPath ? (
          <img src={promotion.store.logoPath} alt={promotion.store?.name || "Loja"} />
        ) : (
          <strong className="logo-fallback">{promotion.store?.name || "Sua loja"}</strong>
        )}
        <span>{promotion.badgeText}</span>
      </header>
      <div className="share-cover-copy">
        <strong>{promotion.title}</strong>
        <p>{promotion.subtitle}</p>
        <b>{validity}</b>
      </div>
      <div className="share-cover-products">
        {products.map((product) => (
          <div key={product.id}>
            <img src={product.imagePath} alt={product.name || "Produto"} />
            <strong>{formatPrice(product.wholesalePriceCents)}</strong>
          </div>
        ))}
      </div>
      <footer>{promotion.hashtag}</footer>
    </article>
  );
}

const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;
const PREVIEW_PAGE_GAP = 22;

function PromoPreview({ promotion }) {
  const viewportRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const pageCount = promotion.pages?.length || 1;
  const naturalHeight = pageCount * A4_HEIGHT_PX + Math.max(0, pageCount - 1) * PREVIEW_PAGE_GAP;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateWidth = () => setViewportWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const fitScale = viewportWidth
    ? Math.min(1, Math.max(0.2, (viewportWidth - 2) / A4_WIDTH_PX))
    : 1;
  const scale = fitScale * previewZoom;

  return (
    <aside className="preview-panel">
      <div className="preview-heading">
        <div>
          <span>PRÉVIA AO VIVO</span>
          <strong>A4 • PDF</strong>
        </div>
        <div className="preview-meta">
          <i>{pageCount > 1 ? `${pageCount} páginas` : "1 página"}</i>
          <div className="preview-zoom-controls" aria-label="Zoom da prévia">
            <button
              type="button"
              onClick={() => setPreviewZoom((current) => Math.max(1, current - 0.25))}
              disabled={previewZoom <= 1}
              aria-label="Reduzir prévia"
            >
              <ZoomOut size={15} />
            </button>
            <b>{Math.round(previewZoom * 100)}%</b>
            <button
              type="button"
              onClick={() => setPreviewZoom((current) => Math.min(2.5, current + 0.25))}
              disabled={previewZoom >= 2.5}
              aria-label="Ampliar prévia"
            >
              <ZoomIn size={15} />
            </button>
          </div>
        </div>
      </div>
      <div className="preview-frame">
        <div ref={viewportRef} className="preview-viewport">
          <div
            className="preview-stage"
            style={{ width: A4_WIDTH_PX * scale, height: naturalHeight * scale }}
          >
            <div
              className="preview-document-surface"
              style={{
                width: A4_WIDTH_PX,
                transform: `scale(${scale})`,
              }}
            >
              <PromoDocument promotion={promotion} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function App() {
  const cameraInputRef = useRef(null);
  const replaceImageInputRef = useRef(null);
  const replaceCameraInputRef = useRef(null);
  const replaceProductIdRef = useRef(null);
  const [promotion, setPromotion] = useState(emptyPromotion);
  const [store, setStore] = useState(emptyStore);
  const [storeDraft, setStoreDraft] = useState(emptyStore);
  const [promotions, setPromotions] = useState([]);
  const [editorSource, setEditorSource] = useState(null);
  const [editorTargetProductId, setEditorTargetProductId] = useState(null);
  const [editorTargetPageId, setEditorTargetPageId] = useState(null);
  const [imagePreviewSource, setImagePreviewSource] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [showPriceErrors, setShowPriceErrors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [remoteUpdate, setRemoteUpdate] = useState(null);
  const [conflictPromotion, setConflictPromotion] = useState(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [exportItems, setExportItems] = useState([]);
  const promotionRef = useRef(emptyPromotion);
  const dirtyRef = useRef(false);
  const tabIdRef = useRef("");

  const draftKey = (id) => (id ? `${DRAFT_STORAGE_KEY}-${id}` : DRAFT_STORAGE_KEY);
  const totalProducts = promotionProducts(promotion).length;
  const activePageId = selectedPageId || promotion.pages[0]?.id;

  useEffect(() => {
    promotionRef.current = promotion;
  }, [promotion]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (
      showPriceErrors &&
      promotionProducts(promotion).every((product) => product.wholesalePriceCents > 0)
    ) {
      setShowPriceErrors(false);
      setStatus((current) => (current === "error" ? "ready" : current));
      setMessage((current) => (current === PRICE_REQUIRED_MESSAGE ? "" : current));
    }
  }, [promotion, showPriceErrors]);

  function markDraft(updater) {
    dirtyRef.current = true;
    setDirty(true);
    setPromotion((current) =>
      typeof updater === "function" ? updater(current) : { ...current, ...updater },
    );
  }

  function replacePages(current, pages) {
    return {
      ...current,
      pages: pages.map((page, position) => ({
        ...page,
        position,
        products: (page.products || []).map((product, productPosition) => ({
          ...product,
          position: productPosition,
        })),
      })),
    };
  }

  function applyRemotePromotion(nextPromotion) {
    const normalized = normalizePromotion(nextPromotion);
    promotionRef.current = normalized;
    dirtyRef.current = false;
    setPromotion(normalized);
    setStore(normalized.store);
    setStoreDraft(normalized.store);
    setSelectedPageId(normalized.pages[0]?.id || null);
    setDirty(false);
    setRemoteUpdate(null);
    setConflictPromotion(null);
    setConflictDialogOpen(false);
    window.localStorage.removeItem(draftKey(normalized.id));
    setStatus("ready");
  }

  async function refreshPromotionList() {
    try {
      const response = await fetch("/api/promotions", { cache: "no-store" });
      if (response.ok) setPromotions((await response.json()).items || []);
    } catch {
      // The editor remains usable when the secondary list request is unavailable.
    }
  }

  async function loadPromotion(id, restoreDraft = true) {
    setStatus("loading");
    const endpoint = id ? `/api/promotions/${id}` : "/api/promotion";
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar a promoção.");
    const loadedPromotion = normalizePromotion(await response.json());
    setStore(loadedPromotion.store);
    setStoreDraft(loadedPromotion.store);
    let draft = null;
    if (!isPrintMode && restoreDraft) {
      const savedDraft =
        window.localStorage.getItem(draftKey(loadedPromotion.id)) ||
        (loadedPromotion.id === 1 ? window.localStorage.getItem(DRAFT_STORAGE_KEY) : null);
      try {
        draft = savedDraft ? JSON.parse(savedDraft) : null;
      } catch {
        window.localStorage.removeItem(draftKey(loadedPromotion.id));
      }
    }
    if (draft?.promotion && Number.isInteger(draft.baseVersion)) {
      const restoredPromotion = normalizePromotion({
        ...draft.promotion,
        version: draft.baseVersion,
      });
      promotionRef.current = restoredPromotion;
      dirtyRef.current = true;
      setPromotion(restoredPromotion);
      setSelectedPageId(restoredPromotion.pages[0]?.id || null);
      setDirty(true);
      if (restoredPromotion.version !== loadedPromotion.version) {
        setRemoteUpdate(loadedPromotion);
        setConflictPromotion(loadedPromotion);
        setConflictDialogOpen(true);
      } else setMessage("Rascunho local restaurado.");
    } else {
      promotionRef.current = loadedPromotion;
      dirtyRef.current = false;
      setPromotion(loadedPromotion);
      setSelectedPageId(loadedPromotion.pages[0]?.id || null);
      setDirty(false);
    }
    setStatus("ready");
    const exportResponse = await fetch(`/api/promotions/${loadedPromotion.id}/exports`).catch(
      () => null,
    );
    if (exportResponse?.ok) setExportItems((await exportResponse.json()).items || []);
    if (isPrintMode) document.documentElement.dataset.printReady = "true";
  }

  useEffect(() => {
    if (!isPrintMode) {
      const existingTabId = window.sessionStorage.getItem(TAB_ID_STORAGE_KEY);
      tabIdRef.current = existingTabId || createDraftId();
      if (!existingTabId) window.sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabIdRef.current);
      refreshPromotionList();
    }
    loadPromotion(printPromotionId).catch(() => {
      setStatus("error");
      setMessage("Não foi possível carregar a promoção.");
    });
  }, []);

  useEffect(() => {
    if (isPrintMode) return undefined;
    let cancelled = false;
    async function checkForRemoteChanges() {
      try {
        const response = await fetch(`/api/promotions/${promotionRef.current.id}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const latest = normalizePromotion(await response.json());
        if (latest.version <= promotionRef.current.version) return;
        if (dirtyRef.current) {
          setRemoteUpdate(latest);
          setConflictPromotion(latest);
          return;
        }
        applyRemotePromotion(latest);
        setMessage("Promoção atualizada com a versão mais recente.");
      } catch {
        // The next interval retries without interrupting local editing.
      }
    }
    const interval = window.setInterval(checkForRemoteChanges, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isPrintMode || !dirty) return;
    window.localStorage.setItem(
      draftKey(promotion.id),
      JSON.stringify({
        baseVersion: promotion.version,
        promotion,
        tabId: tabIdRef.current,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [dirty, promotion]);

  const startImageEditor = useCallback(
    (file, targetProductId = null, targetPageId = activePageId) => {
      if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) {
        setStatus("error");
        setMessage("Use JPG, PNG ou WebP com até 10 MB.");
        return;
      }
      setEditorTargetProductId(targetProductId);
      setEditorTargetPageId(targetPageId);
      setEditorSource(URL.createObjectURL(file));
      setMessage("");
      setStatus("ready");
    },
    [activePageId],
  );

  const onDrop = useCallback(
    (acceptedFiles, fileRejections) => {
      if (fileRejections.length > 0) {
        setStatus("error");
        setMessage("Solte uma imagem JPG, PNG ou WebP de até 10 MB.");
        return;
      }
      if (totalProducts >= MAX_PRODUCTS) {
        setStatus("error");
        setMessage(`O limite é de ${MAX_PRODUCTS} produtos por promoção.`);
        return;
      }
      const file = acceptedFiles[0];
      if (file) startImageEditor(file);
    },
    [startImageEditor, totalProducts],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    maxFiles: 1,
    maxSize: MAX_IMAGE_SIZE,
    multiple: false,
  });

  function selectFile(event) {
    const file = event.target.files?.[0];
    if (file && totalProducts >= MAX_PRODUCTS) {
      setStatus("error");
      setMessage(`O limite é de ${MAX_PRODUCTS} produtos por promoção.`);
    } else if (file) startImageEditor(file);
    event.target.value = "";
  }

  function closeImageEditor() {
    if (editorSource?.startsWith("blob:")) URL.revokeObjectURL(editorSource);
    setEditorSource(null);
    setEditorTargetProductId(null);
    setEditorTargetPageId(null);
  }

  function openReplacementInput(productId, inputRef) {
    replaceProductIdRef.current = productId;
    inputRef.current?.click();
  }

  function handleReplacementFile(event) {
    const file = event.target.files?.[0];
    const productId = replaceProductIdRef.current;
    if (file && productId !== null) startImageEditor(file, productId);
    event.target.value = "";
  }

  function retakeImage() {
    const targetProductId = editorTargetProductId;
    const targetPageId = editorTargetPageId;
    closeImageEditor();
    window.setTimeout(() => {
      if (targetProductId === null) cameraInputRef.current?.click();
      else {
        replaceProductIdRef.current = targetProductId;
        replaceCameraInputRef.current?.click();
      }
      setEditorTargetPageId(targetPageId);
    }, 0);
  }

  async function uploadEditedImage(file) {
    const targetProductId = editorTargetProductId;
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("/api/uploads", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a imagem.");
      if (targetProductId === null && totalProducts >= MAX_PRODUCTS)
        throw new Error(`O limite é de ${MAX_PRODUCTS} produtos por promoção.`);
      if (targetProductId === null) {
        const targetPage =
          promotion.pages.find(
            (page) =>
              page.id === editorTargetPageId && page.products.length < GRID_LIMITS[page.grid],
          ) || promotion.pages.find((page) => page.products.length < GRID_LIMITS[page.grid]);
        if (!targetPage)
          throw new Error("Adicione uma página ou libere espaço antes de inserir outro produto.");
        markDraft((current) =>
          replacePages(
            current,
            current.pages.map((page) =>
              page.id === targetPage.id
                ? {
                    ...page,
                    products: [
                      ...page.products,
                      {
                        id: createDraftId(),
                        imagePath: data.path,
                        name: "",
                        wholesalePriceCents: 0,
                        isHighlighted: false,
                      },
                    ],
                  }
                : page,
            ),
          ),
        );
      } else {
        const found = promotion.pages.some((page) =>
          page.products.some((product) => product.id === targetProductId),
        );
        if (!found) throw new Error("Esse produto não está mais disponível para substituição.");
        markDraft((current) =>
          replacePages(
            current,
            current.pages.map((page) => ({
              ...page,
              products: page.products.map((product) =>
                product.id === targetProductId ? { ...product, imagePath: data.path } : product,
              ),
            })),
          ),
        );
      }
      closeImageEditor();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    }
  }

  function updateProduct(pageId, index, changes) {
    markDraft((current) =>
      replacePages(
        current,
        current.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                products: page.products.map((product, productIndex) =>
                  productIndex === index ? { ...product, ...changes } : product,
                ),
              }
            : page,
        ),
      ),
    );
  }

  function moveProduct(pageId, index, direction) {
    markDraft((current) =>
      replacePages(
        current,
        current.pages.map((page) => {
          if (page.id !== pageId) return page;
          const products = [...page.products];
          const target = index + direction;
          if (target < 0 || target >= products.length) return page;
          [products[index], products[target]] = [products[target], products[index]];
          return { ...page, products };
        }),
      ),
    );
  }

  function moveProductToPage(pageId, index, destinationId) {
    if (!destinationId || destinationId === pageId) return;
    const destination = promotion.pages.find((page) => page.id === destinationId);
    if (!destination || destination.products.length >= GRID_LIMITS[destination.grid]) {
      setStatus("error");
      setMessage("Esse grid já atingiu sua capacidade segura.");
      return;
    }
    markDraft((current) => {
      let moving = null;
      const pages = current.pages
        .map((page) => {
          if (page.id === pageId) moving = page.products[index];
          return page.id === pageId
            ? {
                ...page,
                products: page.products.filter((_, productIndex) => productIndex !== index),
              }
            : page;
        })
        .map((page) =>
          page.id === destinationId && moving
            ? { ...page, products: [...page.products, moving] }
            : page,
        );
      return replacePages(current, pages);
    });
  }

  function removeProduct(pageId, index) {
    if (!window.confirm("Tem certeza de que deseja remover este produto?")) return;
    markDraft((current) =>
      replacePages(
        current,
        current.pages.map((page) =>
          page.id === pageId
            ? { ...page, products: page.products.filter((_, itemIndex) => itemIndex !== index) }
            : page,
        ),
      ),
    );
  }

  function addPage() {
    if (promotion.pages.length >= 12) {
      setStatus("error");
      setMessage("O limite é de 12 páginas por promoção.");
      return;
    }
    const page = {
      id: createDraftId(),
      grid: "classic",
      products: [],
      position: promotion.pages.length,
    };
    markDraft((current) => replacePages(current, [...current.pages, page]));
    setSelectedPageId(page.id);
  }

  function movePage(index, direction) {
    markDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.pages.length) return current;
      const pages = [...current.pages];
      [pages[index], pages[target]] = [pages[target], pages[index]];
      return replacePages(current, pages);
    });
  }

  function changeGrid(pageId, grid) {
    const page = promotion.pages.find((item) => item.id === pageId);
    if (!page || page.products.length > GRID_LIMITS[grid]) {
      setStatus("error");
      setMessage(
        `Esse grid aceita até ${GRID_LIMITS[grid]} produtos. Mova alguns itens antes de trocar.`,
      );
      return;
    }
    markDraft((current) =>
      replacePages(
        current,
        current.pages.map((item) => (item.id === pageId ? { ...item, grid } : item)),
      ),
    );
  }

  function toggleHighlight(pageId, productId) {
    markDraft((current) =>
      replacePages(
        current,
        current.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                products: page.products.map((product) => {
                  const selected = page.products.find((item) => item.id === productId);
                  const shouldHighlight = !selected?.isHighlighted;
                  return {
                    ...product,
                    isHighlighted: shouldHighlight
                      ? product.id === productId
                      : product.id === productId
                        ? false
                        : product.isHighlighted,
                  };
                }),
              }
            : page,
        ),
      ),
    );
  }

  async function savePromotion(
    showSuccess = true,
    operation = "save",
    versionOverride = null,
    resolvingConflict = false,
  ) {
    if (conflictPromotion && !resolvingConflict) {
      setStatus("conflict");
      setMessage("Resolva a divergência antes de salvar novamente.");
      setConflictDialogOpen(true);
      return false;
    }
    if (promotionProducts(promotion).some((product) => product.wholesalePriceCents <= 0)) {
      setShowPriceErrors(true);
      setStatus("error");
      setMessage(PRICE_REQUIRED_MESSAGE);
      return false;
    }
    setStatus(operation === "pdf" ? "pdf" : "saving");
    const payload = {
      title: promotion.title,
      subtitle: promotion.subtitle,
      note: promotion.note,
      badgeText: promotion.badgeText,
      hashtag: promotion.hashtag,
      startsAt: promotion.startsAt || null,
      endsAt: promotion.endsAt || null,
      status: promotion.status,
      theme: promotion.theme,
      palette: promotion.palette,
      version: versionOverride ?? promotion.version,
      pages: promotion.pages.map((page, pagePosition) => ({
        position: pagePosition,
        grid: page.grid,
        products: page.products.map(
          ({ imagePath, name, wholesalePriceCents, isHighlighted }, position) => ({
            imagePath,
            name,
            wholesalePriceCents,
            isHighlighted,
            position,
          }),
        ),
      })),
    };
    let response;
    let data;
    try {
      ({ response, data } = await fetchJsonWithRetry(`/api/promotions/${promotion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
    } catch {
      setStatus("error");
      setMessage("Não foi possível conectar ao servidor para salvar.");
      return false;
    }
    if (!response.ok) {
      if (response.status === 409 && data.promotion) {
        const latest = normalizePromotion(data.promotion);
        setConflictPromotion(latest);
        setRemoteUpdate(latest);
        setConflictDialogOpen(true);
        setStatus("conflict");
        setMessage(data.error || "Outra pessoa salvou uma versão mais recente.");
        return false;
      }
      setStatus("error");
      setMessage(data.error || "Não foi possível salvar.");
      return false;
    }
    const savedPromotion = normalizePromotion(data);
    promotionRef.current = savedPromotion;
    dirtyRef.current = false;
    setPromotion(savedPromotion);
    setStore(savedPromotion.store);
    setStoreDraft(savedPromotion.store);
    setSelectedPageId(savedPromotion.pages[0]?.id || null);
    setDirty(false);
    setRemoteUpdate(null);
    setConflictPromotion(null);
    setConflictDialogOpen(false);
    window.localStorage.removeItem(draftKey(savedPromotion.id));
    await refreshPromotionList();
    if (operation === "pdf") return true;
    setStatus("saved");
    setMessage(showSuccess ? "Promoção salva no banco de dados." : "");
    window.setTimeout(() => setStatus("ready"), 2200);
    return true;
  }

  async function applyDraftOverCurrent() {
    if (!conflictPromotion) return;
    if (
      !window.confirm(
        "Aplicar seu rascunho substituirá a versão mais recente e criará uma nova versão. Continuar?",
      )
    )
      return;
    setConflictDialogOpen(false);
    await savePromotion(true, "save", conflictPromotion.version, true);
  }

  async function downloadFile(endpoint, filename, type, successMessage) {
    const saved = await savePromotion(false, type === "pdf" ? "pdf" : "save");
    if (!saved) return;
    setStatus(type === "pdf" ? "pdf" : "exporting");
    try {
      const response = await fetch(endpoint);
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error || "Não foi possível gerar o arquivo.",
        );
      const blob = await response.blob();
      if (!blob.size || !blob.type.includes(type === "pdf" ? "pdf" : "image"))
        throw new Error("O servidor não retornou um arquivo válido.");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(link.href);
        link.remove();
      }, 0);
      setStatus("ready");
      setMessage(successMessage);
      const exportsResponse = await fetch(`/api/promotions/${promotion.id}/exports`);
      if (exportsResponse.ok) setExportItems((await exportsResponse.json()).items || []);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o arquivo.");
    }
  }

  function generatePdf() {
    return downloadFile(
      `/api/promotion/pdf?promotion=${promotion.id}`,
      "promocao-cronicas.pdf",
      "pdf",
      "PDF gerado e baixado.",
    );
  }

  function generateJpg(pageNumber) {
    return downloadFile(
      `/api/promotions/${promotion.id}/exports/jpg?page=${pageNumber}`,
      `promocao-pagina-${pageNumber}.jpg`,
      "jpg",
      "JPG da página gerado e baixado.",
    );
  }

  function generateCover() {
    return downloadFile(
      `/api/promotions/${promotion.id}/exports/cover`,
      "capa-promocao.jpg",
      "jpg",
      "Capa de compartilhamento gerada e baixada.",
    );
  }

  async function createNewPromotion() {
    try {
      const response = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nova promoção" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível criar a promoção.");
      applyRemotePromotion(data);
      await refreshPromotionList();
      setMessage("Nova promoção criada.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a promoção.");
    }
  }

  async function duplicateCurrentPromotion() {
    try {
      const response = await fetch(`/api/promotions/${promotion.id}/duplicate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível duplicar a promoção.");
      applyRemotePromotion(data);
      await refreshPromotionList();
      setMessage("Promoção duplicada como rascunho independente.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível duplicar a promoção.");
    }
  }

  async function changeStatus(nextStatus) {
    try {
      const response = await fetch(`/api/promotions/${promotion.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o status.");
      applyRemotePromotion(data);
      await refreshPromotionList();
      setMessage(`Promoção ${STATUS_LABELS[nextStatus].toLowerCase()}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
    }
  }

  async function deleteCurrentPromotion() {
    if (!window.confirm("Excluir este rascunho vazio?")) return;
    const response = await fetch(`/api/promotions/${promotion.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setStatus("error");
      setMessage(data.error || "Não foi possível excluir.");
      return;
    }
    await refreshPromotionList();
    await loadPromotion(null, false);
    setMessage("Rascunho excluído.");
  }

  async function saveStore() {
    try {
      const response = await fetch("/api/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storeDraft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a loja.");
      setStore(data);
      setStoreDraft(data);
      setPromotion((current) => ({ ...current, store: data }));
      setMessage("Identidade da loja salva.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a loja.");
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) {
      setStatus("error");
      setMessage("Use JPG, PNG ou WebP com até 10 MB para o logo.");
      return;
    }
    const body = new FormData();
    body.append("image", file);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) {
      setStatus("error");
      setMessage(data.error || "Não foi possível enviar o logo.");
      return;
    }
    setStoreDraft((current) => ({ ...current, logoPath: data.path }));
    setMessage("Logo carregado. Salve a identidade para aplicar.");
  }

  function dateInputValue(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  if (isPrintMode) {
    if (isCoverMode) return <ShareCover promotion={promotion} />;
    return <PromoDocument promotion={promotion} />;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          {store.logoPath ? (
            <img src={store.logoPath} alt={store.name || "Loja"} />
          ) : (
            <strong className="brand-fallback">{store.name || "Sua loja"}</strong>
          )}
          <div>
            <span>ESTÚDIO DE OFERTAS</span>
            <strong>Monte. Salve. Compartilhe.</strong>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => savePromotion()}
            disabled={
              status === "saving" ||
              status === "pdf" ||
              status === "exporting" ||
              Boolean(conflictPromotion)
            }
          >
            {status === "saving" ? (
              <LoaderCircle className="spin" size={18} />
            ) : status === "saved" ? (
              <Check size={18} />
            ) : (
              <Save size={18} />
            )}{" "}
            Salvar
          </button>
          <button
            className="button primary"
            onClick={generatePdf}
            disabled={
              status === "saving" ||
              status === "pdf" ||
              status === "exporting" ||
              Boolean(conflictPromotion)
            }
          >
            {status === "pdf" ? (
              <LoaderCircle className="spin" data-testid="pdf-spinner" size={18} />
            ) : (
              <Download size={18} />
            )}{" "}
            {status === "pdf" ? "Gerando" : "Gerar PDF"}
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="control-panel">
          <section className="promotion-library">
            <div className="library-heading">
              <div>
                <span className="eyebrow">MVP · MINHAS PROMOÇÕES</span>
                <h2>Campanhas</h2>
                <p>Reutilize a última promoção e mantenha o histórico da loja.</p>
              </div>
              <button className="small-button red" type="button" onClick={createNewPromotion}>
                <Sparkles size={16} /> Nova promoção
              </button>
            </div>
            <div className="promotion-cards">
              {promotions.map((item) => (
                <button
                  className={`promotion-card ${item.id === promotion.id ? "active" : ""}`}
                  type="button"
                  key={item.id}
                  onClick={() => loadPromotion(item.id)}
                >
                  <span className="promotion-card-thumb">
                    {item.thumbnailPath ? (
                      <img src={item.thumbnailPath} alt="" />
                    ) : (
                      <Sparkles size={18} />
                    )}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {dateInputValue(item.startsAt) || dateInputValue(item.endsAt)
                        ? `${dateInputValue(item.startsAt) || ""}${item.startsAt && item.endsAt ? " — " : ""}${dateInputValue(item.endsAt) || ""}`
                        : "Sem validade definida"}
                    </small>
                    <small>
                      {STATUS_LABELS[item.status] || item.status} · {item.productCount} produtos
                    </small>
                    <small>Editada em {dateInputValue(item.updatedAt)}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="campaign-actions">
              <button type="button" className="text-button" onClick={duplicateCurrentPromotion}>
                <CopyIcon /> Duplicar
              </button>
              {promotion.status === "draft" && totalProducts === 0 && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={deleteCurrentPromotion}
                >
                  <Trash2 size={15} /> Excluir rascunho vazio
                </button>
              )}
              {promotion.status === "draft" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => changeStatus("published")}
                >
                  <Check size={15} /> Publicar
                </button>
              )}
              {promotion.status === "published" && (
                <button type="button" className="text-button" onClick={() => changeStatus("ended")}>
                  <Check size={15} /> Encerrar
                </button>
              )}
              {promotion.status !== "archived" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => changeStatus("archived")}
                >
                  <ArchiveIcon /> Arquivar
                </button>
              )}
              {promotion.status === "archived" && (
                <button type="button" className="text-button" onClick={() => changeStatus("draft")}>
                  <RefreshCw size={15} /> Reabrir
                </button>
              )}
            </div>
          </section>
          <section className="store-profile">
            <div className="library-heading">
              <div>
                <span className="eyebrow">IDENTIDADE DA LOJA</span>
                <h2>Minha loja</h2>
              </div>
              <span className="store-status">Padrão para novas promoções</span>
            </div>
            <div className="store-fields">
              <label>
                <span>Nome da loja</span>
                <input
                  value={storeDraft.name}
                  maxLength={80}
                  onChange={(event) =>
                    setStoreDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Logo</span>
                <div className="logo-upload">
                  <span>
                    {storeDraft.logoPath ? "Logo carregado" : "Sem logo · usa fallback tipográfico"}
                  </span>
                  <label className="small-button" htmlFor="store-logo-input">
                    <Upload size={15} /> Escolher
                  </label>
                  <input
                    id="store-logo-input"
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={uploadLogo}
                  />
                </div>
              </label>
            </div>
            <div className="theme-row">
              <label>
                <span>Tema padrão</span>
                <select
                  value={storeDraft.defaultTheme}
                  onChange={(event) =>
                    setStoreDraft((current) => ({ ...current, defaultTheme: event.target.value }))
                  }
                >
                  {THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Paleta padrão</span>
                <select
                  value={storeDraft.defaultPalette}
                  onChange={(event) =>
                    setStoreDraft((current) => ({ ...current, defaultPalette: event.target.value }))
                  }
                >
                  {PALETTES.map((palette) => (
                    <option key={palette.id} value={palette.id}>
                      {palette.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="small-button" onClick={saveStore}>
                <Save size={15} /> Salvar identidade
              </button>
            </div>
          </section>
          <div className="panel-intro">
            <span className="step-number">01</span>
            <div>
              <h2>Assinatura da campanha</h2>
              <p>Textos curtos deixam o PDF mais forte no WhatsApp.</p>
            </div>
          </div>
          <div className="fields-grid">
            <label>
              <span>Título</span>
              <input
                value={promotion.title}
                maxLength={60}
                onChange={(event) => markDraft({ title: event.target.value })}
              />
            </label>
            <label>
              <span>Chamada</span>
              <input
                value={promotion.subtitle}
                maxLength={120}
                onChange={(event) => markDraft({ subtitle: event.target.value })}
              />
            </label>
            <label>
              <span>Selo vermelho</span>
              <input
                value={promotion.badgeText}
                maxLength={30}
                onChange={(event) => markDraft({ badgeText: event.target.value })}
              />
            </label>
            <label>
              <span>Hashtag</span>
              <input
                value={promotion.hashtag}
                maxLength={40}
                onChange={(event) => markDraft({ hashtag: event.target.value })}
              />
            </label>
            <label>
              <span>Início da validade</span>
              <input
                type="date"
                value={dateInputValue(promotion.startsAt)}
                onChange={(event) => markDraft({ startsAt: event.target.value || null })}
              />
            </label>
            <label>
              <span>Fim da validade</span>
              <input
                type="date"
                value={dateInputValue(promotion.endsAt)}
                onChange={(event) => markDraft({ endsAt: event.target.value || null })}
              />
            </label>
            <label className="full-field">
              <span>Rodapé</span>
              <input
                value={promotion.note}
                maxLength={140}
                onChange={(event) => markDraft({ note: event.target.value })}
              />
            </label>
          </div>
          <div className="theme-picker">
            <div>
              <span className="field-kicker">Tema desta promoção</span>
              <p>Presets curados para manter preço e texto legíveis.</p>
            </div>
            <div className="theme-options">
              {THEMES.map((theme) => (
                <button
                  type="button"
                  key={theme.id}
                  className={promotion.theme === theme.id ? "selected" : ""}
                  onClick={() => markDraft({ theme: theme.id })}
                >
                  <strong>{theme.name}</strong>
                  <small>{theme.description}</small>
                </button>
              ))}
            </div>
            <div className="palette-options">
              {PALETTES.map((palette) => (
                <button
                  type="button"
                  key={palette.id}
                  className={promotion.palette === palette.id ? "selected" : ""}
                  onClick={() => markDraft({ palette: palette.id })}
                >
                  <span>
                    {palette.colors.map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <strong>{palette.name}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="section-rule" />
          <div className="products-heading">
            <div className="panel-intro compact">
              <span className="step-number">02</span>
              <div>
                <h2>Páginas e produtos</h2>
                <p>
                  {totalProducts} de {MAX_PRODUCTS} produtos • até 12 páginas
                </p>
              </div>
            </div>
            <div className="add-actions">
              <button className="small-button" type="button" onClick={addPage}>
                <PlusIcon /> Adicionar página
              </button>
              <button
                className="small-button red"
                type="button"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={17} /> Tirar foto
              </button>
            </div>
          </div>
          <input
            ref={cameraInputRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={selectFile}
          />
          <input
            ref={replaceImageInputRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleReplacementFile}
          />
          <input
            ref={replaceCameraInputRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReplacementFile}
          />
          <div {...getRootProps({ className: `drop-zone ${isDragActive ? "is-dragging" : ""}` })}>
            <input {...getInputProps()} />
            <div className="drop-zone-icon">
              <ImagePlus size={21} />
            </div>
            <div>
              <strong>{isDragActive ? "Solte a foto aqui" : "Adicionar foto pela galeria"}</strong>
              <span className="drop-copy-desktop">
                Arraste uma foto ou toque para abrir a galeria • cada foto vira um produto
              </span>
              <span className="drop-copy-mobile">
                Toque para abrir a galeria • cada foto vira um produto
              </span>
            </div>
          </div>
          <div className="page-editor-list">
            {promotion.pages.map((page, pageIndex) => (
              <section
                className={`page-editor-card ${activePageId === page.id ? "active" : ""}`}
                key={page.id}
              >
                <header>
                  <div>
                    <span className="page-number">
                      PÁGINA {String(pageIndex + 1).padStart(2, "0")}
                    </span>
                    <strong>
                      {page.products.length}/{GRID_LIMITS[page.grid]} produtos
                    </strong>
                  </div>
                  <div className="page-editor-controls">
                    <select
                      aria-label={`Grid da página ${pageIndex + 1}`}
                      value={page.grid}
                      onChange={(event) => changeGrid(page.id, event.target.value)}
                    >
                      {Object.entries(GRID_LABELS).map(([grid, label]) => (
                        <option key={grid} value={grid}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {pageIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPageId(page.id)}
                        className="page-focus"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      type="button"
                      className="page-move"
                      onClick={() => movePage(pageIndex, -1)}
                      disabled={pageIndex === 0}
                      aria-label="Mover página para cima"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="page-move"
                      onClick={() => movePage(pageIndex, 1)}
                      disabled={pageIndex === promotion.pages.length - 1}
                      aria-label="Mover página para baixo"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </header>
                <div className="product-list">
                  {page.products.map((product, index) => {
                    const hasMissingPrice = showPriceErrors && product.wholesalePriceCents <= 0;
                    return (
                      <div
                        className={`product-row ${hasMissingPrice ? "has-price-error" : ""}`}
                        key={product.id}
                      >
                        <span className="product-index">{String(index + 1).padStart(2, "0")}</span>
                        <div className="product-thumbnail">
                          <img src={product.imagePath} alt={product.name || "Produto"} />
                          <div className="product-thumbnail-actions" aria-label="Ações da imagem">
                            <button
                              type="button"
                              onClick={() => setImagePreviewSource(product.imagePath)}
                              aria-label="Ver imagem em tamanho real"
                              title="Ver imagem"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openReplacementInput(product.id, replaceImageInputRef)}
                              aria-label="Substituir imagem pela galeria"
                              title="Substituir pela galeria"
                            >
                              <Upload size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openReplacementInput(product.id, replaceCameraInputRef)
                              }
                              aria-label="Tirar nova foto para substituir"
                              title="Tirar nova foto"
                            >
                              <Camera size={18} />
                            </button>
                          </div>
                        </div>
                        <label>
                          <span>Nome opcional</span>
                          <input
                            value={product.name || ""}
                            maxLength={60}
                            placeholder="Ex.: Calça jeans"
                            onChange={(event) =>
                              updateProduct(page.id, index, { name: event.target.value })
                            }
                          />
                          <span>Preço de atacado</span>
                          <div className={`price-input ${hasMissingPrice ? "has-error" : ""}`}>
                            <b>R$</b>
                            <NumberFormatBase
                              inputMode="decimal"
                              placeholder="0,00"
                              aria-invalid={hasMissingPrice}
                              value={
                                product.wholesalePriceCents
                                  ? String(product.wholesalePriceCents)
                                  : ""
                              }
                              valueIsNumericString
                              format={formatCentsInput}
                              removeFormatting={(value) => String(value ?? "").replace(/\D/g, "")}
                              onValueChange={({ value }) =>
                                updateProduct(page.id, index, {
                                  wholesalePriceCents: Number(value) || 0,
                                })
                              }
                            />
                          </div>
                        </label>
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => moveProduct(page.id, index, -1)}
                            disabled={index === 0}
                            aria-label="Subir"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveProduct(page.id, index, 1)}
                            disabled={index === page.products.length - 1}
                            aria-label="Descer"
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            className={product.isHighlighted ? "highlighted" : ""}
                            onClick={() => toggleHighlight(page.id, product.id)}
                            aria-label="Marcar como destaque"
                            title="Marcar como destaque"
                          >
                            <Sparkles size={15} />
                          </button>
                          <select
                            aria-label="Mover produto para outra página"
                            value=""
                            onChange={(event) =>
                              moveProductToPage(page.id, index, event.target.value)
                            }
                          >
                            <option value="">Mover</option>
                            {promotion.pages.map(
                              (otherPage, otherPageIndex) =>
                                otherPage.id !== page.id && (
                                  <option
                                    key={otherPage.id}
                                    value={otherPage.id}
                                    disabled={
                                      otherPage.products.length >= GRID_LIMITS[otherPage.grid]
                                    }
                                  >
                                    Página {otherPageIndex + 1}
                                  </option>
                                ),
                            )}
                          </select>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => removeProduct(page.id, index)}
                            aria-label="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="export-actions">
            <div>
              <span className="field-kicker">Arquivos prontos para compartilhar</span>
              <p>PDF completo, JPG por página e capa opcional.</p>
            </div>
            <div>
              <button
                type="button"
                className="small-button"
                onClick={() => generateJpg(1)}
                disabled={!promotion.pages.length}
              >
                <ImagePlus size={15} /> JPG página 1
              </button>
              <button type="button" className="small-button" onClick={generateCover}>
                <ImagePlus size={15} /> Capa 4:5
              </button>
            </div>
          </div>
          {exportItems.length > 0 && (
            <div className="export-history">
              <strong>Últimos exports</strong>
              {exportItems.slice(0, 4).map((item) => (
                <span key={item.id}>
                  {item.format.toUpperCase()} {item.pageNumber ? `· página ${item.pageNumber}` : ""}{" "}
                  · {dateInputValue(item.createdAt)}
                </span>
              ))}
            </div>
          )}
          {remoteUpdate && (
            <div className="remote-update-message">
              <div>
                <RefreshCw size={17} />
                <span>
                  Uma versão mais recente foi salva enquanto você editava. Seu rascunho local foi
                  preservado.
                </span>
              </div>
              <button type="button" onClick={() => setConflictDialogOpen(true)}>
                Resolver
              </button>
            </div>
          )}
          {message && (
            <div
              className={`status-message ${status === "error" || status === "conflict" ? "error" : ""}`}
            >
              {message}
              <button onClick={() => setMessage("")}>
                <X size={14} />
              </button>
            </div>
          )}
        </section>
        <PromoPreview promotion={promotion} />
      </div>
      {editorSource && (
        <ImageEditor
          source={editorSource}
          onCancel={closeImageEditor}
          onDone={uploadEditedImage}
          onRetake={retakeImage}
        />
      )}
      {imagePreviewSource && (
        <ImagePreviewModal
          source={imagePreviewSource}
          onClose={() => setImagePreviewSource(null)}
        />
      )}
      {status === "error" && message && (
        <div className="toast toast-error" role="alert" data-testid="error-toast">
          <span>{message}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {conflictPromotion && conflictDialogOpen && (
        <ConflictDialog
          latestPromotion={conflictPromotion}
          localPromotion={promotion}
          onUseRemote={() => applyRemotePromotion(conflictPromotion)}
          onApplyDraft={applyDraftOverCurrent}
          onKeepDraft={() => setConflictDialogOpen(false)}
        />
      )}
    </main>
  );
}

export default App;
