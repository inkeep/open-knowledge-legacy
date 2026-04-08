/**
 * V7: Yjs v14 Delta Protocol Test
 *
 * Tests whether y-prosemirror can work with Yjs v14's unified YType.
 * The hypothesis: Yjs v14 refactored to a unified YType<DeltaConf>,
 * and if y-prosemirror works through a generic delta protocol,
 * both ProseMirror and CodeMirror could bind to the same CRDT.
 *
 * Step 1: Can yjs@14 and y-prosemirror@1.3.7 coexist?
 * Step 2: Can y-prosemirror's sync plugin initialize with a v14 Y.Doc?
 * Step 3: If so, does content sync work?
 */
import * as Y from 'yjs';

console.log('=== V7: Yjs v14 Delta Protocol Test ===\n');

// Step 1: Check Yjs version
console.log('Step 1: Yjs installation check');
console.log(`  Yjs version info:`, typeof Y.Doc);
console.log(`  Y.Doc available: ${typeof Y.Doc === 'function'}`);

// Check if v14 API is present
const doc = new Y.Doc();
console.log(`  Y.Doc created successfully`);

// Check for v14-specific APIs
const xmlFragment = doc.getXmlFragment('test');
console.log(`  XmlFragment type: ${xmlFragment.constructor.name}`);
console.log(`  Has toDelta: ${typeof (xmlFragment as any).toDelta === 'function'}`);
console.log(`  Has toDeltaDeep: ${typeof (xmlFragment as any).toDeltaDeep === 'function'}`);
console.log(`  Has applyDelta: ${typeof (xmlFragment as any).applyDelta === 'function'}`);

// Check for unified YType
const text = doc.getText('test-text');
console.log(`  Text type: ${text.constructor.name}`);
console.log(`  XmlFragment constructor === Text constructor: ${xmlFragment.constructor === text.constructor}`);

// Check if they share a common YType base
const xmlProto = Object.getPrototypeOf(xmlFragment);
const textProto = Object.getPrototypeOf(text);
console.log(`  Same prototype: ${xmlProto === textProto}`);
console.log(`  XmlFragment proto name: ${xmlProto.constructor.name}`);
console.log(`  Text proto name: ${textProto.constructor.name}`);

// Step 2: Try importing y-prosemirror
console.log('\nStep 2: y-prosemirror import test');
try {
  const yPM = await import('y-prosemirror');
  console.log(`  y-prosemirror imported successfully`);
  console.log(`  Exports: ${Object.keys(yPM).join(', ')}`);
  console.log(`  ySyncPlugin available: ${typeof yPM.ySyncPlugin === 'function'}`);
  console.log(`  yUndoPlugin available: ${typeof yPM.yUndoPlugin === 'function'}`);

  // Step 3: Try creating the sync plugin with a v14 doc
  console.log('\nStep 3: ySyncPlugin creation test');
  try {
    const v14Doc = new Y.Doc();
    const fragment = v14Doc.getXmlFragment('prosemirror');
    console.log(`  Created v14 XmlFragment for prosemirror binding`);

    // The sync plugin expects an XmlFragment
    const plugin = yPM.ySyncPlugin(fragment);
    console.log(`  ySyncPlugin created successfully: ${typeof plugin}`);
    console.log(`  Plugin key: ${plugin.spec.key}`);
  } catch (e) {
    console.log(`  ySyncPlugin creation FAILED:`);
    console.log(`  Error: ${e}`);
    if (e instanceof Error) {
      console.log(`  Stack: ${e.stack}`);
    }
  }
} catch (e) {
  console.log(`  y-prosemirror import FAILED:`);
  console.log(`  Error: ${e}`);
  if (e instanceof Error) {
    console.log(`  Stack: ${e.stack}`);
  }
}

// Step 4: Check if v14 has the unified YType concept
console.log('\nStep 4: Unified YType analysis');
try {
  const doc2 = new Y.Doc();

  // In v14, check if we can get a YType with different DeltaConf
  const frag = doc2.getXmlFragment('test-frag');
  const txt = doc2.getText('test-txt');

  // Check available methods
  const fragMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(frag)).sort();
  const txtMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(txt)).sort();

  // Find methods unique to each type
  const fragOnly = fragMethods.filter((m) => !txtMethods.includes(m));
  const txtOnly = txtMethods.filter((m) => !fragMethods.includes(m));
  const shared = fragMethods.filter((m) => txtMethods.includes(m));

  console.log(`  XmlFragment methods (${fragMethods.length}): ${fragMethods.slice(0, 15).join(', ')}...`);
  console.log(`  Text methods (${txtMethods.length}): ${txtMethods.slice(0, 15).join(', ')}...`);
  console.log(`  XmlFragment-only (${fragOnly.length}): ${fragOnly.join(', ')}`);
  console.log(`  Text-only (${txtOnly.length}): ${txtOnly.join(', ')}`);
  console.log(`  Shared (${shared.length}): ${shared.join(', ')}`);
} catch (e) {
  console.log(`  Analysis failed: ${e}`);
}

console.log('\n=== V7 Test Complete ===');
