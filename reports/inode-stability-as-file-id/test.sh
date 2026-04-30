#!/usr/bin/env bash
#
# Test harness — does (dev, ino) provide stable identity for files and folders
# across the operations a content directory actually sees?
#
# Tested on macOS (APFS via /tmp). Linux ext4/btrfs is expected to behave
# similarly for tests 1–11; cross-FS detail in test 7 is macOS-specific.
#
# Each test prints STABLE / CHANGED / EXPECTED so a reader can scan results.

set -u

TEST_DIR="${1:-/tmp/inode-test}"
rm -rf "$TEST_DIR" && mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "Running in: $TEST_DIR"
echo "Filesystem dev: $(stat -f '%d' .)"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 1: Rename folder within same FS ==="
mkdir folder-a
ID1=$(stat -f '%d:%i' folder-a)
echo "Before rename: $ID1"
mv folder-a folder-b
ID2=$(stat -f '%d:%i' folder-b)
echo "After  rename: $ID2"
[ "$ID1" = "$ID2" ] && echo "STABLE" || echo "CHANGED"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 2: Move folder into another folder (same FS) ==="
mkdir parent
ID1=$(stat -f '%d:%i' folder-b)
echo "Before move: $ID1"
mv folder-b parent/
ID2=$(stat -f '%d:%i' parent/folder-b)
echo "After  move: $ID2"
[ "$ID1" = "$ID2" ] && echo "STABLE" || echo "CHANGED"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 3: Files inside a moved folder keep their inodes ==="
echo "hello" > parent/folder-b/note.md
FID1=$(stat -f '%d:%i' parent/folder-b/note.md)
echo "File before parent rename: $FID1"
mv parent renamed-parent
FID2=$(stat -f '%d:%i' renamed-parent/folder-b/note.md)
echo "File after  parent rename: $FID2"
[ "$FID1" = "$FID2" ] && echo "STABLE" || echo "CHANGED"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 4: cp creates a NEW inode ==="
ID1=$(stat -f '%d:%i' renamed-parent/folder-b/note.md)
echo "Original: $ID1"
cp renamed-parent/folder-b/note.md renamed-parent/folder-b/note-copy.md
ID2=$(stat -f '%d:%i' renamed-parent/folder-b/note-copy.md)
echo "Copy:     $ID2"
[ "$ID1" = "$ID2" ] && echo "STABLE (unexpected)" || echo "CHANGED (expected)"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 5: rm + recreate at same path ==="
touch ephemeral.md
ID1=$(stat -f '%i' ephemeral.md)
echo "Original: $ID1"
rm ephemeral.md
touch ephemeral.md
ID2=$(stat -f '%i' ephemeral.md)
echo "Recreate: $ID2"
[ "$ID1" = "$ID2" ] && echo "REUSED" || echo "NEW INODE"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 6: In-place edit vs atomic-save (write-tmp + rename) ==="
echo "v1" > inplace.md
IN1=$(stat -f '%i' inplace.md)
echo "inplace before: $IN1"
echo "v2" >> inplace.md
IN2=$(stat -f '%i' inplace.md)
echo "inplace after edit (>>): $IN2"

echo "v1" > atomic.md
AT1=$(stat -f '%i' atomic.md)
echo "atomic before: $AT1"
echo "v2" > atomic.md.tmp
mv atomic.md.tmp atomic.md
AT2=$(stat -f '%i' atomic.md)
echo "atomic after (write-tmp + mv): $AT2"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 7: Cross-filesystem move (HFS+ disk image) ==="
DMG=/tmp/xfs-inode-test.dmg
hdiutil create -size 10m -fs HFS+ -volname XFSTest "$DMG" -ov >/dev/null
hdiutil attach "$DMG" >/dev/null
echo "/tmp dev:              $(stat -f '%d' /tmp)"
echo "/Volumes/XFSTest dev: $(stat -f '%d' /Volumes/XFSTest)"
echo "x" > moveme.md
BEFORE=$(stat -f '%d:%i' moveme.md)
echo "Before: $BEFORE"
mv moveme.md /Volumes/XFSTest/ 2>/dev/null || true
AFTER=$(stat -f '%d:%i' /Volumes/XFSTest/moveme.md)
echo "After:  $AFTER"
[ "$BEFORE" = "$AFTER" ] && echo "STABLE (unexpected)" || echo "CHANGED (expected)"
hdiutil detach /Volumes/XFSTest >/dev/null
rm -f "$DMG"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 8: Symlink — own inode vs target inode ==="
mkdir realdir
ln -s realdir linkdir
echo "ls -lid linkdir   (the symlink itself):"
ls -lid linkdir
echo "ls -liLd linkdir  (follows to target):"
ls -liLd linkdir
echo "ls -lid realdir   (target):"
ls -lid realdir
echo
echo "Node fs.stat()  follows symlinks (== ls -liLd)"
echo "Node fs.lstat() does not        (== ls -lid)"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 9: Hardlink — same inode, different paths ==="
echo "v1" > original.md
ln original.md hardlink.md
echo "original: $(stat -f '%d:%i' original.md)"
echo "hardlink: $(stat -f '%d:%i' hardlink.md)"
rm original.md
echo "after rm original.md, hardlink.md still exists:"
echo "  content: $(cat hardlink.md)"
echo "  inode:   $(stat -f '%i' hardlink.md)"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 10: Rapid create/delete churn — does the kernel reuse inodes? ==="
TOTAL=200
INODES_FILE=$(mktemp)
for i in $(seq 1 $TOTAL); do
  touch churn.md
  stat -f '%i' churn.md >> "$INODES_FILE"
  rm churn.md
done
UNIQUE=$(sort -u "$INODES_FILE" | wc -l | tr -d ' ')
REUSED=$((TOTAL - UNIQUE))
echo "$TOTAL create/delete cycles → $REUSED inode reuses, $UNIQUE unique inodes"
rm -f "$INODES_FILE"
echo

# ---------------------------------------------------------------------------
echo "=== TEST 11: Editor-style atomic save (the gotcha) ==="
echo "v1" > doc.md
B=$(stat -f '%i' doc.md)
echo "Before save: $B"
echo "v2" > doc.md.tmp
mv doc.md.tmp doc.md
A=$(stat -f '%i' doc.md)
echo "After save:  $A"
[ "$B" = "$A" ] && echo "STABLE" || echo "CHANGED — file watchers keying on inode see this as 'deleted + new file'"
echo

echo "Done. Cleaning up $TEST_DIR …"
cd /
rm -rf "$TEST_DIR"
