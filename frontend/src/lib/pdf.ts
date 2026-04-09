import { jsPDF } from "jspdf";

import type { DomainProficiencyRating, Locale, PathRecord } from "../types";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 86;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BG = "#0c1017";
const PANEL = "#121924";
const PANEL_SOFT = "#1a2330";
const BORDER = "#2a3442";
const TEXT = "#f4efe6";
const MUTED = "#b7b1a7";
const ACCENT = "#dfc07a";
const TEAL = "#7fd5cd";

type ExportOptions = {
  locale: Locale;
  pathRecord: PathRecord;
  rankTitle: string;
  proficiencyLabel: (rating: DomainProficiencyRating) => string;
};

type PageState = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  y: number;
};

function createPage(locale: Locale, pageTitle: string, pageIndex: number) {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(locale === "zh" ? "無法建立 PDF 畫布。" : "Failed to create PDF canvas.");
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  ctx.fillStyle = ACCENT;
  ctx.font = "700 28px 'IBM Plex Sans', sans-serif";
  ctx.fillText(locale === "zh" ? "升級之路" : "Level-Up Journey", PAGE_MARGIN, 56);

  ctx.fillStyle = TEXT;
  ctx.font = "700 58px Georgia, serif";
  ctx.fillText(pageTitle, PAGE_MARGIN, 126);

  if (pageIndex > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 22px 'IBM Plex Sans', sans-serif";
    ctx.fillText(locale === "zh" ? `續頁 ${pageIndex + 1}` : `Page ${pageIndex + 1}`, PAGE_WIDTH - PAGE_MARGIN - 120, 56);
  }

  return { canvas, ctx, y: 168 };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text.trim()) return [];

  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const next = `${current}${char}`;
    if (ctx.measureText(next).width <= maxWidth || current.length === 0) {
      current = next;
    } else {
      lines.push(current);
      current = char;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawSectionTitle(ctx: CanvasRenderingContext2D, title: string, y: number) {
  ctx.fillStyle = ACCENT;
  ctx.font = "700 24px 'IBM Plex Sans', sans-serif";
  ctx.fillText(title, PAGE_MARGIN, y);
}

async function loadImage(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

async function drawHeaderSection(page: PageState, options: ExportOptions) {
  const { ctx } = page;
  const { pathRecord, rankTitle, locale } = options;
  const boxY = page.y;
  const boxHeight = 226;
  roundedRect(ctx, PAGE_MARGIN, boxY, CONTENT_WIDTH, boxHeight, 34, PANEL, BORDER);

  ctx.fillStyle = TEXT;
  ctx.font = "700 58px Georgia, serif";
  ctx.fillText(pathRecord.path.name, PAGE_MARGIN + 44, boxY + 78);

  ctx.fillStyle = MUTED;
  ctx.font = "600 22px 'IBM Plex Sans', sans-serif";
  ctx.fillText(locale === "zh" ? "目前稱號" : "Current Title", PAGE_WIDTH - PAGE_MARGIN - 220, boxY + 58);

  ctx.fillStyle = TEXT;
  ctx.font = "700 40px 'IBM Plex Sans', sans-serif";
  ctx.fillText(rankTitle, PAGE_WIDTH - PAGE_MARGIN - 220, boxY + 110);

  roundedRect(ctx, PAGE_MARGIN + 44, boxY + 112, 220, 92, 28, PANEL_SOFT, "rgba(223, 192, 122, 0.3)");
  ctx.fillStyle = TEXT;
  ctx.font = "700 56px Georgia, serif";
  ctx.fillText(String(pathRecord.path.level), PAGE_MARGIN + 78, boxY + 176);

  const metricX = PAGE_MARGIN + 312;
  ctx.fillStyle = MUTED;
  ctx.font = "600 22px 'IBM Plex Sans', sans-serif";
  ctx.fillText(locale === "zh" ? "總經驗" : "Total XP", metricX, boxY + 148);
  ctx.fillText(locale === "zh" ? "距離下一級" : "To Next Level", metricX + 270, boxY + 148);

  ctx.fillStyle = TEXT;
  ctx.font = "700 34px 'IBM Plex Sans', sans-serif";
  ctx.fillText(pathRecord.path.total_exp.toLocaleString(), metricX, boxY + 194);
  ctx.fillText(pathRecord.path.xp_to_next_level.toLocaleString(), metricX + 270, boxY + 194);

  roundedRect(ctx, metricX, boxY + 212, 560, 14, 999, "#232b36");
  const progress = Math.max(
    0,
    Math.min(
      1,
      1 - pathRecord.path.xp_to_next_level / Math.max(pathRecord.path.total_exp + pathRecord.path.xp_to_next_level, 1),
    ),
  );
  roundedRect(ctx, metricX, boxY + 212, 560 * progress, 14, 999, TEAL);
  page.y = boxY + boxHeight + 42;
}

async function drawBadgeSection(page: PageState, options: ExportOptions) {
  const { ctx } = page;
  const { locale, pathRecord } = options;
  drawSectionTitle(ctx, locale === "zh" ? "徽章" : "Badges", page.y);
  page.y += 26;

  const badges = pathRecord.badges.slice(0, 6);
  if (!badges.length) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 24px 'IBM Plex Sans', sans-serif";
    ctx.fillText(locale === "zh" ? "目前沒有徽章。" : "No badges yet.", PAGE_MARGIN, page.y + 34);
    page.y += 68;
    return;
  }

  const images = await Promise.all(
    badges.map((badge) => loadImage(`/badges/${badge.type}-${badge.tier}.png`)),
  );

  const columns = 3;
  const gap = 24;
  const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const cardHeight = 188;
  const startY = page.y + 20;

  badges.forEach((badge, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = PAGE_MARGIN + column * (cardWidth + gap);
    const y = startY + row * (cardHeight + 18);

    roundedRect(ctx, x, y, cardWidth, cardHeight, 30, PANEL, BORDER);
    ctx.drawImage(images[index], x + 26, y + 26, 92, 92);

    ctx.fillStyle = TEXT;
    ctx.font = "700 26px 'IBM Plex Sans', sans-serif";
    const nameLines = wrapText(ctx, badge.name, cardWidth - 152);
    nameLines.slice(0, 2).forEach((line, lineIndex) => {
      ctx.fillText(line, x + 138, y + 60 + lineIndex * 30);
    });

    ctx.fillStyle = ACCENT;
    ctx.font = "700 24px 'IBM Plex Sans', sans-serif";
    ctx.fillText(`${badge.progress}%`, x + 138, y + 126);

    ctx.fillStyle = MUTED;
    ctx.font = "600 18px 'IBM Plex Sans', sans-serif";
    const tierText =
      locale === "zh"
        ? badge.tier === "gold"
          ? "金階"
          : badge.tier === "silver"
            ? "銀階"
            : "銅階"
        : badge.tier.toUpperCase();
    ctx.fillText(tierText, x + 138, y + 154);
  });

  page.y = startY + Math.ceil(badges.length / columns) * cardHeight + 42;
}

function drawNarrativeSection(page: PageState, options: ExportOptions) {
  const { ctx } = page;
  const { locale, pathRecord } = options;
  drawSectionTitle(ctx, locale === "zh" ? "旅途狀態" : "Journey State", page.y);
  const sectionY = page.y + 18;
  roundedRect(ctx, PAGE_MARGIN, sectionY, CONTENT_WIDTH, 158, 30, PANEL, BORDER);

  ctx.fillStyle = MUTED;
  ctx.font = "600 20px 'IBM Plex Sans', sans-serif";
  ctx.fillText(locale === "zh" ? "目前狀況" : "Current Status", PAGE_MARGIN + 28, sectionY + 40);

  ctx.fillStyle = TEXT;
  ctx.font = "500 24px 'IBM Plex Sans', sans-serif";
  wrapText(ctx, pathRecord.path.current_status, CONTENT_WIDTH - 56).slice(0, 3).forEach((line, index) => {
    ctx.fillText(line, PAGE_MARGIN + 28, sectionY + 78 + index * 30);
  });

  page.y = sectionY + 198;
}

function drawDomainCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  title: string,
  tier: string,
  reason: string,
  proficiencyLabel: string,
) {
  const bodyWidth = width - 48;
  ctx.font = "700 24px 'IBM Plex Sans', sans-serif";
  const reasonLines = wrapText(ctx, reason, bodyWidth);
  const titleLines = wrapText(ctx, title, bodyWidth - 180).slice(0, 2);
  const cardHeight = 112 + Math.max(1, reasonLines.length) * 28;

  roundedRect(ctx, x, y, width, cardHeight, 28, PANEL, BORDER);
  ctx.fillStyle = TEXT;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, x + 24, y + 40 + index * 28);
  });

  const tierWidth = Math.max(112, ctx.measureText(proficiencyLabel).width + 38);
  roundedRect(ctx, x + width - tierWidth - 24, y + 20, tierWidth, 36, 999, PANEL_SOFT);
  ctx.fillStyle = ACCENT;
  ctx.font = "700 18px 'IBM Plex Sans', sans-serif";
  ctx.fillText(proficiencyLabel, x + width - tierWidth - 24 + 18, y + 44);

  ctx.fillStyle = MUTED;
  ctx.font = "500 20px 'IBM Plex Sans', sans-serif";
  reasonLines.slice(0, 5).forEach((line, index) => {
    ctx.fillText(line, x + 24, y + 92 + index * 26);
  });
  ctx.fillStyle = "#7f8896";
  ctx.font = "600 18px 'IBM Plex Sans', sans-serif";
  ctx.fillText(tier, x + 24, y + cardHeight - 20);
}

export async function exportPathPdf(options: ExportOptions) {
  const pages: PageState[] = [createPage(options.locale, options.pathRecord.path.name, 0)];

  await drawHeaderSection(pages[0], options);
  await drawBadgeSection(pages[0], options);
  drawNarrativeSection(pages[0], options);

  let page = pages[0];
  drawSectionTitle(page.ctx, options.locale === "zh" ? "技能" : "Skills", page.y);
  page.y += 18;

  options.pathRecord.domains.forEach((domain) => {
    const probeCtx = page.ctx;
    probeCtx.font = "500 20px 'IBM Plex Sans', sans-serif";
    const reasonLines = wrapText(probeCtx, domain.proficiency_reason, CONTENT_WIDTH - 48);
    const estimatedHeight = 112 + Math.max(1, reasonLines.length) * 28;

    if (page.y + estimatedHeight + 40 > PAGE_HEIGHT - PAGE_MARGIN) {
      page = createPage(options.locale, options.pathRecord.path.name, pages.length);
      pages.push(page);
      drawSectionTitle(page.ctx, options.locale === "zh" ? "技能" : "Skills", page.y);
      page.y += 18;
    }

    drawDomainCard(
      page.ctx,
      PAGE_MARGIN,
      page.y + 18,
      CONTENT_WIDTH,
      domain.name,
      domain.summary,
      domain.proficiency_reason,
      options.proficiencyLabel(domain.proficiency_rating),
    );
    page.y += estimatedHeight + 22;
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  pages.forEach((entry, index) => {
    if (index > 0) pdf.addPage();
    pdf.addImage(entry.canvas.toDataURL("image/png", 1), "PNG", 0, 0, pdfWidth, pdfHeight);
  });

  pdf.save(`${options.pathRecord.path.name.replace(/\s+/g, "-").toLowerCase()}-journey.pdf`);
}
