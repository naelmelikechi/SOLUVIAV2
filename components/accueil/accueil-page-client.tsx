'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  User as UserIcon,
  UsersRound,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatHeures } from '@/lib/utils/formatters';
import {
  CATEGORIES_INTERNES,
  getCategorieInterneLabel,
  type CategorieInterne,
} from '@/lib/utils/projets-internes';

const TEAM_VISITED_KEY = 'soluvia-accueil-team-visited';
const WIKI_VISITED_KEY = 'soluvia-accueil-wiki-visited';

interface AccueilPageClientProps {
  prenom: string;
  profilComplet: boolean;
  aSaisiTemps: boolean;
  heuresMoisTotal: number;
  heuresParCategorie: Record<string, number>;
  wikiUrl: string | null;
}

export function AccueilPageClient({
  prenom,
  profilComplet,
  aSaisiTemps,
  heuresMoisTotal,
  heuresParCategorie,
  wikiUrl,
}: AccueilPageClientProps) {
  const [teamVisited, setTeamVisited] = useState(false);
  const [wikiVisited, setWikiVisited] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(TEAM_VISITED_KEY) === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTeamVisited(true);
    }
    if (localStorage.getItem(WIKI_VISITED_KEY) === '1') {
      setWikiVisited(true);
    }
  }, []);

  const markTeamVisited = () => {
    localStorage.setItem(TEAM_VISITED_KEY, '1');
    setTeamVisited(true);
  };

  const markWikiVisited = () => {
    localStorage.setItem(WIKI_VISITED_KEY, '1');
    setWikiVisited(true);
  };

  const items: Array<{
    key: string;
    label: string;
    description: string;
    done: boolean;
    href: string;
    external?: boolean;
    onClick?: () => void;
    icon: typeof UserIcon;
  }> = [
    {
      key: 'profil',
      label: 'Compléter mon profil',
      description:
        'Renseigne ton numéro de téléphone et choisis ton avatar dans Mon compte.',
      done: profilComplet,
      href: '/parametres-compte',
      icon: UserIcon,
    },
    {
      key: 'temps',
      label: 'Saisir mon premier temps interne',
      description:
        'Choisis une catégorie (formation, intercontrat, prise de poste...) dans la grille de temps.',
      done: aSaisiTemps,
      href: '/temps',
      icon: Clock,
    },
    {
      key: 'equipe',
      label: 'Découvrir l’équipe',
      description: 'Fais connaissance avec les autres collaborateurs.',
      done: teamVisited,
      href: '/equipe',
      onClick: markTeamVisited,
      icon: UsersRound,
    },
    ...(wikiUrl
      ? [
          {
            key: 'wiki',
            label: 'Lire le wiki onboarding',
            description:
              'Procédures, outils, contacts utiles : tout ce qu il faut savoir pour démarrer.',
            done: wikiVisited,
            href: wikiUrl,
            external: true,
            onClick: markWikiVisited,
            icon: BookOpen,
          },
        ]
      : []),
  ];

  const doneCount = items.filter((it) => it.done).length;
  const progress = Math.round((doneCount / items.length) * 100);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`Bienvenue${prenom ? ` ${prenom}` : ''} !`}
        description="Tu n’as pas encore de projet client affecté. En attendant, voici ce que tu peux faire pour bien démarrer."
      />

      <Card className="p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Mon onboarding</h2>
          <span className="text-muted-foreground text-xs">
            {doneCount} / {items.length}
          </span>
        </div>
        <Progress value={progress} className="mb-4 h-2" />

        <ul className="divide-border divide-y">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li
                key={it.key}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="mt-0.5 shrink-0">
                  {it.done ? (
                    <CheckCircle2 className="text-primary h-5 w-5" />
                  ) : (
                    <Circle className="text-muted-foreground h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span
                      className={cn(
                        'text-sm font-medium',
                        it.done && 'text-muted-foreground line-through',
                      )}
                    >
                      {it.label}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {it.description}
                  </p>
                </div>
                {it.external ? (
                  <a
                    href={it.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={it.onClick}
                    className={buttonVariants({
                      size: 'sm',
                      variant: it.done ? 'ghost' : 'default',
                    })}
                  >
                    {it.done ? 'Revoir' : 'Y aller'}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </a>
                ) : (
                  <Link
                    href={it.href}
                    onClick={it.onClick}
                    className={buttonVariants({
                      size: 'sm',
                      variant: it.done ? 'ghost' : 'default',
                    })}
                  >
                    {it.done ? 'Revoir' : 'Y aller'}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Mon temps ce mois-ci</h3>
          <div className="text-foreground mb-3 text-2xl font-semibold">
            {formatHeures(heuresMoisTotal)}
          </div>
          {Object.keys(heuresParCategorie).length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Aucune saisie ce mois-ci. Va sur la grille de temps pour
              commencer.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {Object.entries(heuresParCategorie)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, h]) => (
                  <li key={cat} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {getCategorieInterneLabel(cat)}
                    </span>
                    <span className="font-mono">{formatHeures(h)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">
            Catégories de temps interne
          </h3>
          <p className="text-muted-foreground mb-3 text-xs">
            Le temps saisi ici n’est pas comptabilisé dans la production client.
          </p>
          <ul className="space-y-1 text-xs">
            {CATEGORIES_INTERNES.map((cat) => (
              <li key={cat} className="flex items-center gap-2">
                <span className="bg-muted-foreground/40 h-1 w-1 rounded-full" />
                <span>{getCategorieInterneLabel(cat as CategorieInterne)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="bg-primary/5 border-primary/20 p-5">
        <h3 className="mb-1 text-sm font-semibold">
          En attente d’une affectation
        </h3>
        <p className="text-muted-foreground text-xs">
          Un administrateur va t’affecter prochainement à un projet client.
          Cette page disparaîtra automatiquement de ta sidebar dès que ce sera
          le cas.
        </p>
      </Card>
    </div>
  );
}
