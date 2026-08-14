import { useEffect, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  Crop,
  Download,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import "./index.css";

const emptyPromotion = {
  title: "Ofertas da semana",
  subtitle: "Preço de atacado para você economizar de verdade",
  note: "Ofertas válidas enquanto durarem os estoques",
  badgeText: "ATACADO",
  hashtag: "#VEMPROCRÔNICAS",
  products: [],
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const isPrintMode = new URLSearchParams(window.location.search).has("print");

function formatPrice(cents) {
  return money.format((Number(cents) || 0) / 100);
}

function priceToCents(value) {
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(".", "")
    .replace(",", ".");
  return Math.round((Number.parseFloat(normalized) || 0) * 100);
}

function centerAspectCrop(width, height) {
  return centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 1, width, height), width, height);
}

async function transformImage(source, operation) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const rotate = operation === "left" || operation === "right";
  const canvas = document.createElement("canvas");
  canvas.width = rotate ? image.naturalHeight : image.naturalWidth;
  canvas.height = rotate ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  context.translate(canvas.width / 2, canvas.height / 2);
  if (operation === "left") context.rotate(-Math.PI / 2);
  if (operation === "right") context.rotate(Math.PI / 2);
  if (operation === "flipX") context.scale(-1, 1);
  if (operation === "flipY") context.scale(1, -1);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function cropImage(image, crop) {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const canvas = document.createElement("canvas");
  const width = crop?.width ? Math.round(crop.width * scaleX) : image.naturalWidth;
  const height = crop?.height ? Math.round(crop.height * scaleY) : image.naturalHeight;
  canvas.width = Math.min(width, 1400);
  canvas.height = Math.min(height, 1400);
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (crop?.x || 0) * scaleX,
    (crop?.y || 0) * scaleY,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

function ImageEditor({ source, onCancel, onDone }) {
  const imageRef = useRef(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [zoom, setZoom] = useState(1);
  const [workingSource, setWorkingSource] = useState(source);
  const [busy, setBusy] = useState(false);

  async function applyTransform(operation) {
    setBusy(true);
    const nextSource = await transformImage(workingSource, operation);
    setWorkingSource(nextSource);
    setZoom(1);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setBusy(false);
  }

  async function finish() {
    setBusy(true);
    const blob = await cropImage(imageRef.current, completedCrop);
    await onDone(new File([blob], "produto.jpg", { type: "image/jpeg" }));
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editar imagem">
      <section className="image-editor">
        <div className="editor-title">
          <div>
            <span className="eyebrow">AJUSTE DA FOTO</span>
            <h2>Deixe o produto irresistível</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="crop-stage">
          <ReactCrop
            crop={crop}
            onChange={(_, percent) => setCrop(percent)}
            onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
            aspect={1}
          >
            <img
              ref={imageRef}
              src={workingSource}
              alt="Produto para recortar"
              style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
              onLoad={(event) =>
                setCrop(centerAspectCrop(event.currentTarget.width, event.currentTarget.height))
              }
            />
          </ReactCrop>
        </div>
        <div className="editor-controls">
          <label className="zoom-control">
            <span>Zoom</span>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <div className="transform-buttons">
            <button onClick={() => applyTransform("left")} title="Girar à esquerda">
              <RotateCcw size={19} />
            </button>
            <button onClick={() => applyTransform("right")} title="Girar à direita">
              <RotateCw size={19} />
            </button>
            <button onClick={() => applyTransform("flipX")} title="Espelhar horizontalmente">
              ↔
            </button>
            <button onClick={() => applyTransform("flipY")} title="Espelhar verticalmente">
              ↕
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="button ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="button primary" onClick={finish} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <Crop size={18} />} Usar imagem
          </button>
        </div>
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
    ? Array.from({ length: Math.ceil(promotion.products.length / 6) }, (_, index) =>
        promotion.products.slice(index * 6, index * 6 + 6),
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

function App() {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [promotion, setPromotion] = useState(emptyPromotion);
  const [editorSource, setEditorSource] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/promotion")
      .then((response) => response.json())
      .then((data) => {
        setPromotion({ ...emptyPromotion, ...data, products: data.products || [] });
        setStatus("ready");
        if (isPrintMode) document.documentElement.dataset.printReady = "true";
      })
      .catch(() => {
        setStatus("error");
        setMessage("Não foi possível carregar a promoção.");
      });
  }, []);

  function selectFile(event) {
    const file = event.target.files?.[0];
    if (file) setEditorSource(URL.createObjectURL(file));
    event.target.value = "";
  }

  async function uploadEditedImage(file) {
    const body = new FormData();
    body.append("image", file);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setPromotion((current) => ({
      ...current,
      products: [
        ...current.products,
        {
          id: `draft-${crypto.randomUUID()}`,
          imagePath: data.path,
          wholesalePriceCents: 0,
          position: current.products.length,
        },
      ],
    }));
    setEditorSource(null);
  }

  function updateProduct(index, changes) {
    setPromotion((current) => ({
      ...current,
      products: current.products.map((product, productIndex) =>
        productIndex === index ? { ...product, ...changes } : product,
      ),
    }));
  }

  function moveProduct(index, direction) {
    setPromotion((current) => {
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

  async function savePromotion(showSuccess = true) {
    if (promotion.products.some((product) => product.wholesalePriceCents <= 0)) {
      setMessage("Preencha o preço de atacado de todos os produtos.");
      return false;
    }
    setStatus("saving");
    const payload = {
      title: promotion.title,
      subtitle: promotion.subtitle,
      note: promotion.note,
      badgeText: promotion.badgeText,
      hashtag: promotion.hashtag,
      products: promotion.products.map(({ imagePath, wholesalePriceCents }, position) => ({
        imagePath,
        wholesalePriceCents,
        position,
      })),
    };
    const response = await fetch("/api/promotion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus("error");
      setMessage(data.error || "Não foi possível salvar.");
      return false;
    }
    setPromotion(data);
    setStatus("saved");
    setMessage(showSuccess ? "Promoção salva no banco de dados." : "");
    window.setTimeout(() => setStatus("ready"), 2200);
    return true;
  }

  async function generatePdf() {
    const saved = await savePromotion(false);
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
            disabled={status === "saving"}
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
            disabled={status === "saving" || status === "pdf"}
          >
            {status === "pdf" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Download size={18} />
            )}{" "}
            Gerar PDF
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
                onChange={(event) => setPromotion({ ...promotion, title: event.target.value })}
              />
            </label>
            <label>
              <span>Chamada</span>
              <input
                value={promotion.subtitle}
                maxLength={120}
                onChange={(event) => setPromotion({ ...promotion, subtitle: event.target.value })}
              />
            </label>
            <label>
              <span>Selo vermelho</span>
              <input
                value={promotion.badgeText}
                maxLength={30}
                onChange={(event) => setPromotion({ ...promotion, badgeText: event.target.value })}
              />
            </label>
            <label>
              <span>Hashtag</span>
              <input
                value={promotion.hashtag}
                maxLength={40}
                onChange={(event) => setPromotion({ ...promotion, hashtag: event.target.value })}
              />
            </label>
            <label className="full-field">
              <span>Rodapé</span>
              <input
                value={promotion.note}
                maxLength={140}
                onChange={(event) => setPromotion({ ...promotion, note: event.target.value })}
              />
            </label>
          </div>
          <div className="section-rule" />
          <div className="products-heading">
            <div className="panel-intro compact">
              <span className="step-number">02</span>
              <div>
                <h2>Produtos</h2>
                <p>{promotion.products.length} de 24 ofertas</p>
              </div>
            </div>
            <div className="add-actions">
              <button className="small-button" onClick={() => fileInputRef.current.click()}>
                <ImagePlus size={17} /> Galeria
              </button>
              <button className="small-button red" onClick={() => cameraInputRef.current.click()}>
                <Camera size={17} /> Tirar foto
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={selectFile}
          />
          <input
            ref={cameraInputRef}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={selectFile}
          />
          <div className="product-list">
            {promotion.products.map((product, index) => (
              <div className="product-row" key={product.id}>
                <span className="product-index">{String(index + 1).padStart(2, "0")}</span>
                <img src={product.imagePath} alt="Produto" />
                <label>
                  <span>Preço de atacado</span>
                  <div className="price-input">
                    <b>R$</b>
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={
                        product.wholesalePriceCents
                          ? (product.wholesalePriceCents / 100).toFixed(2).replace(".", ",")
                          : ""
                      }
                      onChange={(event) =>
                        updateProduct(index, {
                          wholesalePriceCents: priceToCents(event.target.value),
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
                    className="danger"
                    onClick={() =>
                      setPromotion({
                        ...promotion,
                        products: promotion.products.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                    aria-label="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {promotion.products.length === 0 && (
              <button className="empty-products" onClick={() => fileInputRef.current.click()}>
                <ImagePlus size={28} />
                <strong>Adicione o primeiro produto</strong>
                <span>Foto quadrada e bem iluminada funciona melhor.</span>
              </button>
            )}
          </div>
          {message && (
            <div className={`status-message ${status === "error" ? "error" : ""}`}>
              {message}
              <button onClick={() => setMessage("")}>
                <X size={14} />
              </button>
            </div>
          )}
        </section>
        <aside className="preview-panel">
          <div className="preview-heading">
            <div>
              <span>PRÉVIA AO VIVO</span>
              <strong>A4 • PDF</strong>
            </div>
            <i>
              {promotion.products.length > 6
                ? `${Math.ceil(promotion.products.length / 6)} páginas`
                : "1 página"}
            </i>
          </div>
          <div className="preview-frame">
            <PromoDocument promotion={promotion} />
          </div>
        </aside>
      </div>
      {editorSource && (
        <ImageEditor
          source={editorSource}
          onCancel={() => setEditorSource(null)}
          onDone={uploadEditedImage}
        />
      )}
    </main>
  );
}

export default App;
