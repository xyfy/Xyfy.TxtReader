#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
  echo -e "${RED}Error: Version number required${NC}"
  echo "Usage: ./tag-release.sh <version>"
  echo "Example: ./tag-release.sh 0.2.1"
  exit 1
fi

VERSION="$1"
TAG="v$VERSION"

# Validate version format
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}Error: Invalid version format (use X.Y.Z)${NC}"
  exit 1
fi

echo -e "${YELLOW}=== Release Tag Creator ===${NC}"
echo "Version: $VERSION"
echo "Tag: $TAG"
echo ""

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo -e "${RED}Error: Tag $TAG already exists${NC}"
  exit 1
fi

# Confirm
echo -e "${YELLOW}This will create and push tag $TAG${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 1
fi

echo ""
echo -e "${GREEN}Creating tag $TAG...${NC}"
git tag -a "$TAG" -m "Release version $VERSION"

echo -e "${GREEN}Pushing tag to origin...${NC}"
git push origin "$TAG"

echo ""
echo -e "${GREEN}✓ Tag pushed successfully!${NC}"
echo ""
echo "GitHub Actions will now automatically:"
echo "  1. Run all tests"
echo "  2. Build the package"
echo "  3. Create a Release on GitHub"
echo ""
echo "Monitor progress at: https://github.com/xyfy/Xyfy.TxtReader/actions"
