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

  it('calcule les % de conversion', () => {
    render(
      <TrinityFunnel
        production={1000}
        facture={900}
        encaisse={500}
        productionTrend={0}
      />,
    );
    expect(screen.getByText('90%')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
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
    // Les 2 % de conversion doivent etre 0%
    expect(screen.getAllByText('0%').length).toBe(2);
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
    expect(screen.getByText(/200,00\s*€.*reste à facturer/i)).toBeDefined();
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
