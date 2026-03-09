from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


ROOT = Path(r"C:\Users\HP\Downloads\GestionStore_v1 - Client")
OUTPUT = ROOT / "output" / "pdf" / "gestionstore-resume-app-fr.pdf"


def wrap_text(c: canvas.Canvas, text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if pdfmetrics.stringWidth(trial, font_name, font_size) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_lines(
    c: canvas.Canvas,
    lines: list[str],
    x: float,
    y: float,
    font_name: str,
    font_size: float,
    line_height: float,
) -> float:
    c.setFont(font_name, font_size)
    for line in lines:
        c.drawString(x, y, line)
        y -= line_height
    return y


def draw_section_title(c: canvas.Canvas, title: str, x: float, y: float) -> float:
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, y, title)
    return y - 16


def draw_bullets(
    c: canvas.Canvas,
    items: list[str],
    x: float,
    y: float,
    max_width: float,
    font_name: str = "Helvetica",
    font_size: float = 9.5,
    line_height: float = 11.8,
) -> float:
    bullet_indent = 12
    text_width = max_width - bullet_indent
    for item in items:
        wrapped = wrap_text(c, item, font_name, font_size, text_width)
        c.setFont(font_name, font_size)
        c.drawString(x, y, "-")
        c.drawString(x + bullet_indent, y, wrapped[0])
        y -= line_height
        for continuation in wrapped[1:]:
            c.drawString(x + bullet_indent, y, continuation)
            y -= line_height
    return y


def build_pdf() -> Path:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    width, height = A4

    margin_x = 42
    y = height - 42
    content_width = width - (2 * margin_x)

    c.setTitle("Resume Application GestionStore")
    c.setAuthor("Codex")

    c.setFont("Helvetica-Bold", 17)
    c.drawString(margin_x, y, "GestionStore - Resume Application (1 page)")
    y -= 18
    c.setFont("Helvetica", 9)
    c.drawString(margin_x, y, f"Genere le: {date.today().isoformat()} | Source: preuves du depot uniquement")
    y -= 20

    y = draw_section_title(c, "Ce que c'est", margin_x, y)
    what_it_is = (
        "GestionStore est une application PWA de gestion de boutique, pensee pour fonctionner en ligne et hors ligne. "
        "Elle regroupe ventes, stock, operations clients/fournisseurs et synchronisation dans une seule interface."
    )
    lines = wrap_text(c, what_it_is, "Helvetica", 9.8, content_width)
    y = draw_lines(c, lines, margin_x, y, "Helvetica", 9.8, 12.2) - 6

    y = draw_section_title(c, "Pour qui", margin_x, y)
    who_for = [
        "Persona principale: gerant de boutique, avec besoins complets sur produits, fournisseurs, rapports, utilisateurs et parametres.",
        "Persona secondaire: vendeur pour les operations quotidiennes (ventes, clients, commandes clients).",
    ]
    y = draw_bullets(c, who_for, margin_x, y, content_width) - 4

    y = draw_section_title(c, "Ce que l'app fait", margin_x, y)
    features = [
        "Authentification par roles (gerant/vendeur), changement de mot de passe obligatoire et refresh token.",
        "Gestion catalogue et stock: categories, produits, mouvements de stock et page de stock faible.",
        "Flux ventes et commandes clients avec suivi des modes de paiement (cash, credit, mobile).",
        "Operations fournisseurs: fournisseurs, commandes fournisseur, acomptes et credits fournisseurs.",
        "Suivi d'activite via depenses, journaux d'audit et pages/routes de rapports.",
        "Saisie hors ligne avec IndexedDB (Dexie), marquage pending et synchro automatique vers le backend.",
    ]
    y = draw_bullets(c, features, margin_x, y, content_width) - 4

    y = draw_section_title(c, "Comment ca marche (architecture)", margin_x, y)
    architecture = [
        "Frontend: React + Vite PWA + Tailwind; pages et routes protegees dans frontend/src/App.tsx.",
        "Base locale: Dexie (frontend/src/db/index.ts) pour mirrorer les entites metier et l'etat de synchro.",
        "Service de sync: frontend/src/services/syncService.ts pousse records/deletions et recupere les mises a jour.",
        "API backend: Express (backend/src/index.ts) avec auth, CORS, rate-limit et routes modulaires.",
        "Persistance: Prisma + PostgreSQL, schema metier dans backend/prisma/schema.prisma.",
        "Flux de donnees: action UI -> Dexie (syncStatus=pending) -> /api/sync -> upsert/pull backend -> Dexie synced.",
    ]
    y = draw_bullets(c, architecture, margin_x, y, content_width) - 4

    y = draw_section_title(c, "Demarrage rapide", margin_x, y)
    run_steps = [
        "Prerequis: Node.js 18+ et PostgreSQL.",
        "Depuis la racine du projet: npm run app:start",
        "Ouvrir http://localhost:5173 et se connecter avec admin@store.com / admin123.",
        "Verification backend: http://localhost:3001/api/health",
        "Arret: npm run app:stop",
    ]
    y = draw_bullets(c, run_steps, margin_x, y, content_width)

    if y < 26:
        raise RuntimeError("Debordement detecte: reduire le contenu pour tenir sur une page.")

    c.save()
    return OUTPUT


if __name__ == "__main__":
    pdf_path = build_pdf()
    print(str(pdf_path))
