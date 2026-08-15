import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { useDropzone } from "react-dropzone";
import { NumberFormatBase } from "react-number-format";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  Download,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  LoaderCircle,
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

const emptyPromotion = {
  version: 1,
  title: "Ofertas da semana",
  subtitle: "Preço de atacado para você economizar de verdade",
  note: "Ofertas válidas enquanto durarem os estoques",
  badgeText: "ATACADO",
  hashtag: "#VEMPROCRÔNICAS",
  products: [],
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const isPrintMode = new URLSearchParams(window.location.search).has("print");
const PRODUCTS_PER_PAGE = 6;
const MAX_PRODUCTS = 24;
const PRODUCT_IMAGE_ASPECT = 1;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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

function createDraftId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePromotion(data) {
  return {
    ...emptyPromotion,
    ...data,
    version: Number(data?.version) || 1,
    products: data?.products || [],
  };
}

function conflictDetails(localPromotion, latestPromotion) {
  const fields = [
    ["title", "título"],
    ["subtitle", "chamada"],
    ["badgeText", "selo"],
    ["hashtag", "hashtag"],
    ["note", "rodapé"],
  ];
  const changedFields = fields
    .filter(([field]) => localPromotion[field] !== latestPromotion[field])
    .map(([, label]) => label);
  const productsChanged =
    JSON.stringify(localPromotion.products) !== JSON.stringify(latestPromotion.products);
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

function PromoPage({ promotion, products, pageNumber, totalPages }) {
  return (
    <article className="promo-page">
      <div className="page-orbit orbit-one" />
      <div className="page-orbit orbit-two" />
      <header className="promo-header">
        <div className="logo-lockup">
          <img src="/logo-cronicas.png" alt="Crônicas" />
        </div>
        <div className="headline">
          <span>{promotion.badgeText}</span>
          <h1>{promotion.title}</h1>
          <p>{promotion.subtitle}</p>
        </div>
      </header>
      <div className={`products-grid count-${products.length}`}>
        {products.map((product, index) => (
          <div className="product-offer" key={product.id || `${pageNumber}-${index}`}>
            <div className="product-photo">
              <img src={product.imagePath} alt="Produto em promoção" />
            </div>
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
  const pages = promotion.products.length
    ? Array.from({ length: Math.ceil(promotion.products.length / PRODUCTS_PER_PAGE) }, (_, index) =>
        promotion.products.slice(
          index * PRODUCTS_PER_PAGE,
          index * PRODUCTS_PER_PAGE + PRODUCTS_PER_PAGE,
        ),
      )
    : [[]];
  return (
    <div className="promo-document">
      {pages.map((products, index) => (
        <PromoPage
          key={index}
          promotion={promotion}
          products={products}
          pageNumber={index + 1}
          totalPages={pages.length}
        />
      ))}
    </div>
  );
}

const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;
const PREVIEW_PAGE_GAP = 22;

function PromoPreview({ promotion }) {
  const viewportRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const pageCount = promotion.products.length
    ? Math.ceil(promotion.products.length / PRODUCTS_PER_PAGE)
    : 1;
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
  const [editorSource, setEditorSource] = useState(null);
  const [editorTargetProductId, setEditorTargetProductId] = useState(null);
  const [imagePreviewSource, setImagePreviewSource] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [remoteUpdate, setRemoteUpdate] = useState(null);
  const [conflictPromotion, setConflictPromotion] = useState(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const promotionRef = useRef(emptyPromotion);
  const dirtyRef = useRef(false);
  const tabIdRef = useRef("");

  useEffect(() => {
    promotionRef.current = promotion;
  }, [promotion]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  function markDraft(updater) {
    dirtyRef.current = true;
    setDirty(true);
    setPromotion((current) =>
      typeof updater === "function" ? updater(current) : { ...current, ...updater },
    );
  }

  function applyRemotePromotion(nextPromotion) {
    const normalized = normalizePromotion(nextPromotion);
    promotionRef.current = normalized;
    dirtyRef.current = false;
    setPromotion(normalized);
    setDirty(false);
    setRemoteUpdate(null);
    setConflictPromotion(null);
    setConflictDialogOpen(false);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setStatus("ready");
  }

  const startImageEditor = useCallback((file, targetProductId = null) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) {
      setStatus("error");
      setMessage("Use JPG, PNG ou WebP com até 10 MB.");
      return;
    }
    setEditorTargetProductId(targetProductId);
    setEditorSource(URL.createObjectURL(file));
    setMessage("");
    setStatus("ready");
  }, []);

  const onDrop = useCallback(
    (acceptedFiles, fileRejections) => {
      if (fileRejections.length > 0) {
        setStatus("error");
        setMessage("Solte uma imagem JPG, PNG ou WebP de até 10 MB.");
        return;
      }
      if (promotion.products.length >= MAX_PRODUCTS) {
        setStatus("error");
        setMessage(`O limite é de ${MAX_PRODUCTS} produtos por promoção.`);
        return;
      }
      const file = acceptedFiles[0];
      if (!file) return;
      startImageEditor(file);
    },
    [promotion.products.length, startImageEditor],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  useEffect(() => {
    if (!isPrintMode) {
      const existingTabId = window.sessionStorage.getItem(TAB_ID_STORAGE_KEY);
      tabIdRef.current = existingTabId || createDraftId();
      if (!existingTabId) window.sessionStorage.setItem(TAB_ID_STORAGE_KEY, tabIdRef.current);
    }
    fetch("/api/promotion")
      .then((response) => response.json())
      .then((data) => {
        const loadedPromotion = normalizePromotion(data);
        const savedDraft = !isPrintMode ? window.localStorage.getItem(DRAFT_STORAGE_KEY) : null;
        let draft = null;
        try {
          draft = savedDraft ? JSON.parse(savedDraft) : null;
        } catch {
          window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
        if (draft?.promotion && Number.isInteger(draft.baseVersion)) {
          const restoredPromotion = normalizePromotion({
            ...draft.promotion,
            version: draft.baseVersion,
          });
          promotionRef.current = restoredPromotion;
          dirtyRef.current = true;
          setPromotion(restoredPromotion);
          setDirty(true);
          if (restoredPromotion.version !== loadedPromotion.version) {
            setRemoteUpdate(loadedPromotion);
            setConflictPromotion(loadedPromotion);
            setConflictDialogOpen(true);
          } else {
            setMessage("Rascunho local restaurado.");
          }
        } else {
          promotionRef.current = loadedPromotion;
          dirtyRef.current = false;
          setPromotion(loadedPromotion);
          setDirty(false);
        }
        setStatus("ready");
        if (isPrintMode) document.documentElement.dataset.printReady = "true";
      })
      .catch(() => {
        setStatus("error");
        setMessage("Não foi possível carregar a promoção.");
      });
  }, []);

  useEffect(() => {
    if (isPrintMode) return undefined;
    let cancelled = false;

    async function checkForRemoteChanges() {
      try {
        const response = await fetch("/api/promotion", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const latest = normalizePromotion(await response.json());
        const current = promotionRef.current;
        if (latest.version <= current.version) return;
        if (dirtyRef.current) {
          setRemoteUpdate(latest);
          setConflictPromotion(latest);
          return;
        }
        applyRemotePromotion(latest);
        setMessage("Promoção atualizada com a versão mais recente.");
      } catch {
        // A próxima verificação periódica tenta novamente sem interromper a edição local.
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
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        baseVersion: promotion.version,
        promotion,
        tabId: tabIdRef.current,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [dirty, promotion]);

  function selectFile(event) {
    const file = event.target.files?.[0];
    if (file && promotion.products.length >= MAX_PRODUCTS) {
      setStatus("error");
      setMessage(`O limite é de ${MAX_PRODUCTS} produtos por promoção.`);
    } else if (file) {
      startImageEditor(file);
    }
    event.target.value = "";
  }

  function closeImageEditor() {
    setEditorSource(null);
    setEditorTargetProductId(null);
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
    closeImageEditor();
    window.setTimeout(() => {
      if (targetProductId === null) {
        cameraInputRef.current?.click();
        return;
      }
      replaceProductIdRef.current = targetProductId;
      replaceCameraInputRef.current?.click();
    }, 0);
  }

  async function uploadEditedImage(file) {
    const targetProductId = editorTargetProductId;
    if (targetProductId === null && promotion.products.length >= MAX_PRODUCTS) {
      setStatus("error");
      setMessage(`O limite é de ${MAX_PRODUCTS} produtos por promoção.`);
      closeImageEditor();
      return;
    }
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("/api/uploads", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a imagem.");

      if (targetProductId === null) {
        markDraft((current) => ({
          ...current,
          products: [
            ...current.products,
            {
              id: createDraftId(),
              imagePath: data.path,
              wholesalePriceCents: 0,
              position: current.products.length,
            },
          ],
        }));
      } else {
        if (!promotion.products.some((product) => product.id === targetProductId)) {
          setStatus("error");
          setMessage("Esse produto não está mais disponível para substituição.");
          return;
        }
        markDraft((current) => ({
          ...current,
          products: current.products.map((product) =>
            product.id === targetProductId ? { ...product, imagePath: data.path } : product,
          ),
        }));
      }
      closeImageEditor();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    }
  }

  function updateProduct(index, changes) {
    markDraft((current) => ({
      ...current,
      products: current.products.map((product, productIndex) =>
        productIndex === index ? { ...product, ...changes } : product,
      ),
    }));
  }

  function moveProduct(index, direction) {
    markDraft((current) => {
      const products = [...current.products];
      const target = index + direction;
      if (target < 0 || target >= products.length) return current;
      [products[index], products[target]] = [products[target], products[index]];
      return {
        ...current,
        products: products.map((product, position) => ({ ...product, position })),
      };
    });
  }

  function removeProduct(index) {
    if (!window.confirm("Tem certeza de que deseja remover este produto?")) return;
    markDraft((current) => ({
      ...current,
      products: current.products
        .filter((_, itemIndex) => itemIndex !== index)
        .map((product, position) => ({ ...product, position })),
    }));
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
    if (promotion.products.some((product) => product.wholesalePriceCents <= 0)) {
      setMessage("Preencha o preço de atacado de todos os produtos.");
      return false;
    }
    setStatus(operation === "pdf" ? "pdf" : "saving");
    const payload = {
      title: promotion.title,
      subtitle: promotion.subtitle,
      note: promotion.note,
      badgeText: promotion.badgeText,
      hashtag: promotion.hashtag,
      version: versionOverride ?? promotion.version,
      products: promotion.products.map(({ imagePath, wholesalePriceCents }, position) => ({
        imagePath,
        wholesalePriceCents,
        position,
      })),
    };
    let response;
    let data;
    try {
      response = await fetch("/api/promotion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await response.json();
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
    setDirty(false);
    setRemoteUpdate(null);
    setConflictPromotion(null);
    setConflictDialogOpen(false);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    if (operation === "pdf") return true;
    setStatus("saved");
    setMessage(showSuccess ? "Promoção salva no banco de dados." : "");
    window.setTimeout(() => setStatus("ready"), 2200);
    return true;
  }

  async function applyDraftOverCurrent() {
    if (!conflictPromotion) return;
    const shouldApply = window.confirm(
      "Aplicar seu rascunho substituirá o conteúdo da versão mais recente e criará uma nova versão. Continuar?",
    );
    if (!shouldApply) return;
    setConflictDialogOpen(false);
    await savePromotion(true, "save", conflictPromotion.version, true);
  }

  async function generatePdf() {
    const saved = await savePromotion(false, "pdf");
    if (!saved) return;
    setStatus("pdf");
    const response = await fetch("/api/promotion/pdf");
    if (!response.ok) {
      const data = await response.json();
      setStatus("error");
      setMessage(data.error);
      return;
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "promocao-cronicas.pdf";
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("ready");
    setMessage("PDF gerado e baixado.");
  }

  if (isPrintMode) return <PromoDocument promotion={promotion} />;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="/logo-cronicas.png" alt="Crônicas" />
          <div>
            <span>ESTÚDIO DE OFERTAS</span>
            <strong>Monte. Salve. Compartilhe.</strong>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => savePromotion()}
            disabled={status === "saving" || status === "pdf" || Boolean(conflictPromotion)}
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
            disabled={status === "saving" || status === "pdf" || Boolean(conflictPromotion)}
          >
            {status === "pdf" ? <ArrowDown className="spin" size={18} /> : <Download size={18} />}{" "}
            {status === "pdf" ? "Gerando" : "Gerar PDF"}
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="control-panel">
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
            <label className="full-field">
              <span>Rodapé</span>
              <input
                value={promotion.note}
                maxLength={140}
                onChange={(event) => markDraft({ note: event.target.value })}
              />
            </label>
          </div>
          <div className="section-rule" />
          <div className="products-heading">
            <div className="panel-intro compact">
              <span className="step-number">02</span>
              <div>
                <h2>Produtos</h2>
                <p>
                  {promotion.products.length} de {MAX_PRODUCTS} fotos • {PRODUCTS_PER_PAGE} por
                  página
                </p>
              </div>
            </div>
            <div className="add-actions">
              <button className="small-button red" onClick={() => cameraInputRef.current.click()}>
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
          <div
            {...getRootProps({
              className: `drop-zone ${isDragActive ? "is-dragging" : ""}`,
            })}
          >
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
          <div className="product-list">
            {promotion.products.map((product, index) => (
              <div className="product-row" key={product.id}>
                <span className="product-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="product-thumbnail">
                  <img src={product.imagePath} alt="Produto" />
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
                      onClick={() => openReplacementInput(product.id, replaceCameraInputRef)}
                      aria-label="Tirar nova foto para substituir"
                      title="Tirar nova foto"
                    >
                      <Camera size={18} />
                    </button>
                  </div>
                </div>
                <label>
                  <span>Preço de atacado</span>
                  <div className="price-input">
                    <b>R$</b>
                    <NumberFormatBase
                      inputMode="decimal"
                      placeholder="0,00"
                      value={product.wholesalePriceCents ? String(product.wholesalePriceCents) : ""}
                      valueIsNumericString
                      format={formatCentsInput}
                      removeFormatting={(value) => String(value ?? "").replace(/\D/g, "")}
                      onValueChange={({ value }) =>
                        updateProduct(index, {
                          wholesalePriceCents: Number(value) || 0,
                        })
                      }
                    />
                  </div>
                </label>
                <div className="row-actions">
                  <button
                    onClick={() => moveProduct(index, -1)}
                    disabled={index === 0}
                    aria-label="Subir"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    onClick={() => moveProduct(index, 1)}
                    disabled={index === promotion.products.length - 1}
                    aria-label="Descer"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removeProduct(index)}
                    aria-label="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
