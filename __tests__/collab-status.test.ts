import { describe, it, expect } from 'vitest';
import {
  deriveCollabStatus,
  isUnassignedCollab,
} from '@/lib/utils/collab-status';

describe('deriveCollabStatus', () => {
  it('admin > tout', () => {
    expect(deriveCollabStatus('admin', false, 0)).toBe('admin');
    expect(deriveCollabStatus('superadmin', null, 5)).toBe('admin');
  });

  it('role=commercial -> commercial', () => {
    expect(deriveCollabStatus('commercial', false, 0)).toBe('commercial');
  });

  it('cdp avec pipelineAccess explicite -> commercial', () => {
    expect(deriveCollabStatus('cdp', true, 0)).toBe('commercial');
  });

  it('cdp sans pipeline + avec projets -> cdp_with_projects', () => {
    expect(deriveCollabStatus('cdp', false, 3)).toBe('cdp_with_projects');
  });

  it('cdp sans pipeline + sans projet -> unassigned_collaborator', () => {
    expect(deriveCollabStatus('cdp', false, 0)).toBe('unassigned_collaborator');
  });

  it('role inconnu sans projet -> unassigned_collaborator', () => {
    expect(deriveCollabStatus(null, null, 0)).toBe('unassigned_collaborator');
    expect(deriveCollabStatus(undefined, undefined, 0)).toBe(
      'unassigned_collaborator',
    );
  });
});

describe('isUnassignedCollab', () => {
  it('true uniquement pour unassigned_collaborator', () => {
    expect(isUnassignedCollab('unassigned_collaborator')).toBe(true);
    expect(isUnassignedCollab('admin')).toBe(false);
    expect(isUnassignedCollab('commercial')).toBe(false);
    expect(isUnassignedCollab('cdp_with_projects')).toBe(false);
  });
});
