import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { OrdemServico } from '../types/database';
import {
  buildOrderDocumentHtml,
  normalizeOrderDocumentConfig,
  type CompanyDocumentConfig,
  type OrderDocumentTemplateConfig,
} from './order-document-template';

interface GenerateOrderDocumentPdfOptions {
  ordem: OrdemServico;
  company?: CompanyDocumentConfig | null;
  logoDataUrl?: string;
  config?: OrderDocumentTemplateConfig | null;
}

function waitForImages(root: Document) {
  return Promise.all(Array.from(root.images).map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
  }));
}

function waitForDocumentPage(iframe: HTMLIFrameElement) {
  return new Promise<{ frameDocument: Document; page: HTMLElement }>((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const frameDocument = iframe.contentDocument;
      const page = frameDocument?.querySelector<HTMLElement>('.page');
      if (frameDocument?.readyState === 'complete' && page) {
        resolve({ frameDocument, page });
        return;
      }
      if (Date.now() - startedAt > 10000) {
        reject(new Error('Não foi possível preparar o conteúdo do PDF da OS.'));
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

export async function generateOrderDocumentPdf(options: GenerateOrderDocumentPdfOptions): Promise<Blob> {
  const config = normalizeOrderDocumentConfig(options.config);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;border:0;pointer-events:none;z-index:-1;';
  iframe.style.width = config.pageOrientation === 'landscape' ? '1123px' : '794px';
  iframe.style.height = config.pageOrientation === 'landscape' ? '794px' : '1123px';

  try {
    iframe.srcdoc = buildOrderDocumentHtml({ ...options, config, autoPrint: false });
    document.body.appendChild(iframe);
    const { frameDocument, page } = await waitForDocumentPage(iframe);
    await waitForImages(frameDocument);
    await frameDocument.fonts?.ready;

    const pdf = new jsPDF({ orientation: config.pageOrientation, unit: 'mm', format: 'a4' });
    const pageWidth = config.pageOrientation === 'landscape' ? 297 : 210;
    const pageHeight = config.pageOrientation === 'landscape' ? 210 : 297;
    const canvas = await html2canvas(page, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: 1.5,
      useCORS: true,
    });
    const imageData = canvas.toDataURL('image/jpeg', 0.94);
    const imageHeight = canvas.height * pageWidth / canvas.width;
    const pageCount = Math.max(1, Math.ceil(imageHeight / pageHeight));
    for (let index = 0; index < pageCount; index += 1) {
      if (index > 0) pdf.addPage('a4', config.pageOrientation);
      pdf.addImage(imageData, 'JPEG', 0, -(index * pageHeight), pageWidth, imageHeight, undefined, 'FAST');
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '').split(',')[1] || ''), { once: true });
    reader.addEventListener('error', () => reject(new Error('Não foi possível ler o PDF da OS.')), { once: true });
    reader.readAsDataURL(blob);
  });
}
