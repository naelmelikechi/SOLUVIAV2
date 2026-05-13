// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TrinityFunnel } from '@/components/dashboard/trinity-funnel';

afterEach(cleanup);

describe('TrinityFunnel', () => {
  it('rend les 3 cards avec leur label', () => {
    render(
      <TrinityFunnel
        production={42580}
        facture={38200}
        encaisse={31100}
        productionTrend={12}
      />,
    );
    expect(screen.getByText('Production')).toBeDefined();
    expect(screen.getByText('Facturé')).toBeDefined();
    expect(screen.getByText('Encaissé')).toBeDefined();
  });

  it('affiche le taux de recouvrement (encaisse / facture)', () => {
    render(
      <TrinityFunnel
        production={1000}
        facture={900}
        encaisse={450}
        productionTrend={0}
      />,
    );
    expect(screen.getByText('50% recouvré')).toBeDefined();
  });

  it("n'affiche pas de % de facturation en prefixe", () => {
    render(
      <TrinityFunnel
        production={1000}
        facture={4000}
        encaisse={0}
        productionTrend={0}
      />,
    );
    expect(screen.queryByText(/^\d+%$/)).toBeNull();
    expect(screen.queryByText(/396%/)).toBeNull();
  });

  it('gere production = 0 sans NaN ni Infinity', () => {
    render(
      <TrinityFunnel
        production={0}
        facture={0}
        encaisse={0}
        productionTrend={0}
      />,
    );
    expect(screen.queryAllByText(/NaN/).length).toBe(0);
    expect(screen.queryAllByText(/Infinity/).length).toBe(0);
  });

  it('affiche subtitle "tout est facturé" quand facture >= production', () => {
    render(
      <TrinityFunnel
        production={100}
        facture={100}
        encaisse={100}
        productionTrend={0}
      />,
    );
    expect(screen.getByText(/tout est facturé/i)).toBeDefined();
    expect(screen.getByText(/tout est encaissé/i)).toBeDefined();
  });

  it('affiche le reste a facturer quand production > facture', () => {
    render(
      <TrinityFunnel
        production={1000}
        facture={800}
        encaisse={800}
        productionTrend={0}
      />,
    );
    expect(screen.getByText(/200\s*€.*reste à facturer/i)).toBeDefined();
  });

  it('affiche le label de periode quand fourni', () => {
    render(
      <TrinityFunnel
        production={100}
        facture={100}
        encaisse={100}
        productionTrend={0}
        periodeLabel="Mai 2026"
      />,
    );
    expect(screen.getByText(/Période : Mai 2026/)).toBeDefined();
  });

  it("n'affiche pas la ligne periode quand absent", () => {
    render(
      <TrinityFunnel
        production={100}
        facture={100}
        encaisse={100}
        productionTrend={0}
      />,
    );
    expect(screen.queryByText(/Période :/)).toBeNull();
  });

  it('masque la card via editMode + onHide', () => {
    const onHide = vi.fn();
    render(
      <TrinityFunnel
        production={100}
        facture={100}
        encaisse={100}
        productionTrend={0}
        editMode
        onHide={onHide}
      />,
    );
    screen.getByLabelText(/masquer le funnel/i).click();
    expect(onHide).toHaveBeenCalledOnce();
  });
});
