/**
 * Ruby: require/require_relative imports + class inheritance + mixin heritage +
 * attr_* properties + arity-filtered call resolution + member-call resolution
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  FIXTURES, getRelationships, getNodesByLabel, edgeSet,
  runPipelineFromRepo, type PipelineResult,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Package: require_relative imports + class inheritance + module include
// ---------------------------------------------------------------------------

describe('Ruby require_relative imports and class hierarchy', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-pkg'),
      () => {},
    );
  }, 60000);

  it('detects exactly 3 classes and 1 module', () => {
    expect(getNodesByLabel(result, 'Class')).toEqual(['AuthService', 'BaseModel', 'User']);
    expect(getNodesByLabel(result, 'Module')).toEqual(['Serializable']);
  });

  it('detects all 6 methods', () => {
    const methods = getNodesByLabel(result, 'Method');
    expect(methods).toContain('save');
    expect(methods).toContain('validate');
    expect(methods).toContain('serialize');
    expect(methods).toContain('get_name');
    expect(methods).toContain('authenticate');
    expect(methods).toContain('process_model');
  });

  it('emits exactly 1 EXTENDS edge: User → BaseModel', () => {
    const extends_ = getRelationships(result, 'EXTENDS');
    expect(extends_.length).toBe(1);
    expect(extends_[0].source).toBe('User');
    expect(extends_[0].target).toBe('BaseModel');
    expect(extends_[0].targetFilePath).toBe('lib/base_model.rb');
  });

  it('emits exactly 1 IMPLEMENTS edge: User → Serializable (include)', () => {
    const implements_ = getRelationships(result, 'IMPLEMENTS');
    expect(implements_.length).toBe(1);
    expect(implements_[0].source).toBe('User');
    expect(implements_[0].target).toBe('Serializable');
  });

  it('resolves all 4 require_relative imports', () => {
    const imports = getRelationships(result, 'IMPORTS');
    expect(imports.length).toBe(4);
    expect(edgeSet(imports)).toEqual([
      'auth_service.rb → user.rb',
      'helpers.rb → base_model.rb',
      'user.rb → base_model.rb',
      'user.rb → serializable.rb',
    ]);
  });

  it('no OVERRIDES edges target Property nodes', () => {
    const overrides = getRelationships(result, 'OVERRIDES');
    for (const edge of overrides) {
      const target = result.graph.getNode(edge.rel.targetId);
      expect(target).toBeDefined();
      expect(target!.label).not.toBe('Property');
    }
  });
});

// ---------------------------------------------------------------------------
// Ambiguous: two files with same class name, require_relative disambiguates
// ---------------------------------------------------------------------------

describe('Ruby ambiguous symbol resolution', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-ambiguous'),
      () => {},
    );
  }, 60000);

  it('detects 2 Handler classes', () => {
    const classes = getNodesByLabel(result, 'Class');
    expect(classes.filter(n => n === 'Handler').length).toBe(2);
    expect(classes).toContain('Processor');
  });

  it('resolves EXTENDS to handlers/a/handler.rb (not handlers/b/handler.rb)', () => {
    const extends_ = getRelationships(result, 'EXTENDS');
    expect(extends_.length).toBe(1);
    expect(extends_[0].source).toBe('Processor');
    expect(extends_[0].target).toBe('Handler');
    expect(extends_[0].targetFilePath).toBe('handlers/a/handler.rb');
  });

  it('require_relative resolves to handlers/a/handler.rb', () => {
    const imports = getRelationships(result, 'IMPORTS');
    expect(imports.length).toBe(1);
    expect(imports[0].targetFilePath).toBe('handlers/a/handler.rb');
  });

  it('all heritage edges point to real graph nodes', () => {
    for (const edge of getRelationships(result, 'EXTENDS')) {
      const target = result.graph.getNode(edge.rel.targetId);
      expect(target).toBeDefined();
      expect(target!.properties.name).toBe(edge.target);
    }
  });
});

// ---------------------------------------------------------------------------
// Call resolution with arity filtering
// ---------------------------------------------------------------------------

describe('Ruby call resolution with arity filtering', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-calls'),
      () => {},
    );
  }, 60000);

  it('resolves run → write_audit to one.rb via arity narrowing', () => {
    const calls = getRelationships(result, 'CALLS');
    expect(calls.length).toBe(1);
    expect(calls[0].source).toBe('run');
    expect(calls[0].target).toBe('write_audit');
    expect(calls[0].targetFilePath).toBe('one.rb');
    expect(calls[0].rel.reason).toBe('import-resolved');
  });
});

// ---------------------------------------------------------------------------
// Member-call resolution: obj.method() resolves through pipeline
// ---------------------------------------------------------------------------

describe('Ruby member-call resolution', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-member-calls'),
      () => {},
    );
  }, 60000);

  it('detects User class (Class node) and save method (Method node)', () => {
    expect(getNodesByLabel(result, 'Class')).toContain('User');
    // Ruby instance methods are Method nodes
    expect(getNodesByLabel(result, 'Method')).toContain('save');
  });

  it('emits HAS_METHOD edge from User to save', () => {
    const hasMethod = getRelationships(result, 'HAS_METHOD');
    const edge = hasMethod.find(e => e.source === 'User' && e.target === 'save');
    expect(edge).toBeDefined();
  });

  it('resolves process_user → save as a member call on User', () => {
    const calls = getRelationships(result, 'CALLS');
    const saveCall = calls.find(c => c.target === 'save');
    expect(saveCall).toBeDefined();
    expect(saveCall!.source).toBe('process_user');
    expect(saveCall!.targetFilePath).toBe('user.rb');
  });

  it('emits 1 require_relative IMPORTS edge', () => {
    const imports = getRelationships(result, 'IMPORTS');
    expect(imports.length).toBe(1);
    expect(imports[0].source).toBe('app.rb');
    expect(imports[0].targetFilePath).toBe('user.rb');
  });
});

// ---------------------------------------------------------------------------
// Mixin heritage: include / extend / prepend all produce IMPLEMENTS edges
// ---------------------------------------------------------------------------

describe('Ruby mixin heritage (include / extend / prepend)', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-mixin-heritage'),
      () => {},
    );
  }, 60000);

  it('detects 1 class and 3 modules', () => {
    expect(getNodesByLabel(result, 'Class')).toEqual(['Record']);
    expect(getNodesByLabel(result, 'Module')).toEqual(['Auditable', 'Cacheable', 'Hookable']);
  });

  it('emits exactly 3 IMPLEMENTS edges for all three mixin types', () => {
    const implements_ = getRelationships(result, 'IMPLEMENTS');
    expect(implements_.length).toBe(3);
    expect(edgeSet(implements_)).toEqual([
      'Record → Auditable',
      'Record → Cacheable',
      'Record → Hookable',
    ]);
  });

  it('emits no EXTENDS edges (mixins are not inheritance)', () => {
    const extends_ = getRelationships(result, 'EXTENDS');
    expect(extends_.length).toBe(0);
  });

  it('resolves 3 require_relative IMPORTS edges', () => {
    const imports = getRelationships(result, 'IMPORTS');
    expect(imports.length).toBe(3);
    expect(edgeSet(imports)).toEqual([
      'record.rb → auditable.rb',
      'record.rb → cacheable.rb',
      'record.rb → hookable.rb',
    ]);
  });

  it('all IMPLEMENTS targets are real graph nodes (Module label)', () => {
    for (const edge of getRelationships(result, 'IMPLEMENTS')) {
      const target = result.graph.getNode(edge.rel.targetId);
      expect(target).toBeDefined();
      expect(target!.label).toBe('Module');
    }
  });
});

// ---------------------------------------------------------------------------
// Property extraction: attr_accessor / attr_reader / attr_writer
// ---------------------------------------------------------------------------

describe('Ruby attr_* property extraction', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-attr-properties'),
      () => {},
    );
  }, 60000);

  it('detects Person class and greet method', () => {
    expect(getNodesByLabel(result, 'Class')).toContain('Person');
    expect(getNodesByLabel(result, 'Method')).toContain('greet');
  });

  it('creates 4 Property nodes for attr_accessor, attr_reader, attr_writer', () => {
    const props = getNodesByLabel(result, 'Property');
    expect(props).toEqual(['age', 'email', 'id', 'name']);
  });

  it('all Property nodes have filePath pointing to person.rb', () => {
    result.graph.forEachNode(n => {
      if (n.label === 'Property') {
        expect(n.properties.filePath).toBe('models/person.rb');
      }
    });
  });

  it('Property nodes carry accessorType in description field', () => {
    const accessorTypes = new Map<string, string>();
    result.graph.forEachNode(n => {
      if (n.label === 'Property') {
        accessorTypes.set(n.properties.name as string, n.properties.description as string);
      }
    });
    expect(accessorTypes.get('name')).toBe('attr_accessor');
    expect(accessorTypes.get('age')).toBe('attr_accessor');
    expect(accessorTypes.get('id')).toBe('attr_reader');
    expect(accessorTypes.get('email')).toBe('attr_writer');
  });
});

// ---------------------------------------------------------------------------
// Receiver-constrained resolution: two classes with same method name
// ---------------------------------------------------------------------------

describe('Ruby receiver-constrained resolution', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-receiver-resolution'),
      () => {},
    );
  }, 60000);

  it('detects User and Repo classes, both with save methods', () => {
    expect(getNodesByLabel(result, 'Class')).toContain('User');
    expect(getNodesByLabel(result, 'Class')).toContain('Repo');
    const saveMethods = getNodesByLabel(result, 'Method').filter(m => m === 'save');
    expect(saveMethods.length).toBe(2);
  });

  it('emits HAS_METHOD edges for both User.save and Repo.save', () => {
    const hasMethod = getRelationships(result, 'HAS_METHOD');
    const userSave = hasMethod.find(e => e.source === 'User' && e.target === 'save');
    const repoSave = hasMethod.find(e => e.source === 'Repo' && e.target === 'save');
    expect(userSave).toBeDefined();
    expect(repoSave).toBeDefined();
  });

  it('resolves at least one save call from process_entities', () => {
    const calls = getRelationships(result, 'CALLS');
    const saveCalls = calls.filter(c => c.target === 'save' && c.source === 'process_entities');
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('all heritage edges point to real graph nodes', () => {
    for (const edge of getRelationships(result, 'EXTENDS')) {
      const target = result.graph.getNode(edge.rel.targetId);
      expect(target).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Local shadow: same-file definition takes priority over require'd name
// ---------------------------------------------------------------------------

describe('Ruby local definition shadows require', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'ruby-local-shadow'),
      () => {},
    );
  }, 60000);

  it('resolves run → save to same-file definition in main.rb, not utils.rb', () => {
    const calls = getRelationships(result, 'CALLS');
    const saveCall = calls.find(c => c.target === 'save' && c.source === 'run');
    expect(saveCall).toBeDefined();
    expect(saveCall!.targetFilePath).toBe('src/main.rb');
  });

  it('does NOT resolve save to utils.rb', () => {
    const calls = getRelationships(result, 'CALLS');
    const saveToUtils = calls.find(c => c.target === 'save' && c.targetFilePath === 'src/utils.rb');
    expect(saveToUtils).toBeUndefined();
  });
});
