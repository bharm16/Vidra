# Enhancement Suggestions Workflow - Complete Technical Documentation

**Last Updated:** 2025-01-XX  
**Status:** Production  
**Complexity:** High (50+ processing steps across 29 files)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Frontend Flow](#frontend-flow)
4. [Backend Flow](#backend-flow)
5. [File Inventory](#file-inventory)
6. [Key Algorithms](#key-algorithms)
7. [Performance Optimizations](#performance-optimizations)
8. [Error Handling](#error-handling)
9. [Metrics & Monitoring](#metrics--monitoring)

---

## Overview

The Enhancement Suggestions workflow provides AI-powered text alternatives when users select text in video prompts. It's a multi-layered system with:

- **2 caching layers** (client-side 5min, server-side 1hr)
- **4 request optimizations** (debouncing, deduplication, cancellation, caching)
- **3 fallback strategies** (category alignment, regeneration, descriptor)
- **50+ processing steps** across frontend and backend

### Key Features

- **Intelligent Text Relocation**: Token-based matching handles whitespace differences
- **Contrastive Decoding**: Prevents "visual collapse" with batch generation
- **Category Alignment**: Ensures suggestions match semantic categories
- **Multi-Mode Support**: Video prompts get specialized handling
- **Request Cancellation**: Supports user cancellation and timeouts

---

## Architecture

### System Layers

```
User Selection
    ↓
Frontend Request Management (debounce, dedupe, cache)
    ↓
API Layer (text relocation, context extraction)
    ↓
Backend Route Handler (validation, logging)
    ↓
EnhancementService (orchestration)
    ↓
Processing Pipeline (generation → diversity → validation → fallback)
    ↓
Response (caching, metrics)
    ↓
Frontend State Update
    ↓
UI Rendering
```

### Component Hierarchy

```
PromptOptimizerContainer
  └─ useEnhancementSuggestions (orchestrator)
      ├─ useSuggestionFetch (request management)
      │   ├─ SuggestionRequestManager (debounce/cancel)
      │   ├─ SuggestionCache (client cache)
      │   └─ enhancementSuggestionsApi (API calls)
      └─ useSuggestionApply (application logic)
          ├─ applySuggestionToPrompt (text replacement)
          └─ updateHighlightSnapshotForSuggestion (span updates)
```

---

## Frontend Flow

### 1. User Interaction

**Entry Points:**

- Text selection in `PromptCanvas` (video mode only)
- Click on highlighted spans
- Keyboard shortcuts

**Files:**

- `client/src/features/prompt-optimizer/PromptCanvas/hooks/useTextSelection.ts`
- `client/src/features/prompt-optimizer/PromptCanvas.tsx`

### 2. Request Management

**Hook:** `useSuggestionFetch`

**Steps:**

1. **Input Validation**: Trim, normalize NFC
2. **Deduplication**: Check `SuggestionRequestManager.isRequestInFlight()`
3. **Cancellation**: Cancel previous request
4. **Context Extraction**: Extract 100 chars before/after
5. **Client Cache Check**: `SuggestionCache.get()` (5min TTL)
6. **Debounced Request**: 150ms trailing-edge delay
7. **Loading State**: Show after debounce fires
8. **Span Context**: Prepare `{ simplifiedSpans, nearbySpans }`
9. **Edit History**: Get last 10 edits
10. **API Call**: `fetchEnhancementSuggestions()`

**Key Files:**

- `client/src/features/prompt-optimizer/PromptOptimizerContainer/hooks/useSuggestionFetch.ts`
- `client/src/features/prompt-optimizer/utils/SuggestionRequestManager.ts`
- `client/src/features/prompt-optimizer/utils/SuggestionCache.ts`

### 3. API Layer

**File:** `client/src/features/prompt-optimizer/api/enhancementSuggestionsApi.ts`

**Steps:**

1. **Timeout Setup**: 3-second timeout with AbortController
2. **Signal Combination**: Combine user cancellation + timeout signals
3. **Text Relocation**: `relocateQuote()` for robust matching
4. **Context Extraction**: Up to 1000 chars before/after
5. **API Request**: POST to `/api/enhancement/suggestions`
6. **Error Handling**: Distinguish timeout vs cancellation

**Key Algorithm:** Token-based text relocation (whitespace-agnostic)

---

## Backend Flow

### 1. Route Handler

**File:** `server/src/routes/enhancement.routes.ts`

**Steps:**

1. Request validation (`suggestionSchema`)
2. Performance monitoring
3. Logging
4. Service delegation
5. Response formatting

### 2. EnhancementService Orchestration

**File:** `server/src/services/enhancement/EnhancementService.ts`

**Steps:**

1. **Metrics Initialization**: Track timing for each phase
2. **Video Context Detection**: Detect video prompts, model targets, sections
3. **Brainstorm Signature**: Create signature for cache key
4. **Cache Key Generation**: Composite key with edit fingerprint
5. **Server Cache Check**: Redis/memory cache (1hr TTL)
6. **Placeholder Detection**: Detect `[placeholder]` patterns
7. **Prompt Building**: Build context-aware prompts
8. **Schema Selection**: Provider-aware JSON schemas
9. **Temperature Selection**: From config or optimizer
10. **Suggestion Generation**: Call `SuggestionGenerationService`
11. **Suggestion Processing**: Call `SuggestionProcessingService`
12. **Result Building**: Group and format suggestions
13. **Caching**: Store result in cache
14. **Metrics Logging**: Log performance data

### 3. Suggestion Generation

**File:** `server/src/services/enhancement/services/SuggestionGenerationService.ts`

**Process:**

1. **Provider Detection**: Detect OpenAI/Groq/Qwen capabilities
2. **Contrastive Decoding**: Attempt batch generation (3 batches, increasing temp)
3. **Standard Fallback**: If contrastive fails, use standard generation
4. **Poisonous Pattern Detection**: Log but allow example patterns
5. **Return**: `{ suggestions, groqCallTime, usedContrastiveDecoding }`

**Contrastive Decoding Algorithm:**

- Batch 1: 4 suggestions, temp 0.4, no constraints
- Batch 2: 4 suggestions, temp 0.5, negative constraint vs Batch 1
- Batch 3: 4 suggestions, temp 0.6, negative constraint vs Batches 1+2
- Negative constraint: "Do not use concepts similar to: [previous]"

### 4. Suggestion Processing

**File:** `server/src/services/enhancement/services/SuggestionProcessingService.ts`

**Pipeline:**

1. **Diversity Enforcement**: Remove similar suggestions (Jaccard similarity >0.7)
2. **Category Alignment**: Validate category match, apply fallbacks if needed
3. **Sanitization**: Filter invalid suggestions (word count, punctuation, etc.)
4. **Fallback Regeneration**: If all filtered, try different constraint modes
5. **Descriptor Fallbacks**: If still empty, use descriptor category fallbacks

**Key Services:**

- `SuggestionDeduplicator`: Ensures diversity
- `CategoryAlignmentService`: Validates categories
- `SuggestionValidationService`: Sanitizes suggestions
- `FallbackRegenerationService`: Regenerates with different constraints

---

## File Inventory

### Frontend (16 files)

**Core Hooks:**

- `useEnhancementSuggestions.ts` - Orchestrator
- `useSuggestionFetch.ts` - Request management
- `useSuggestionApply.ts` - Application logic

**Utilities:**

- `SuggestionRequestManager.ts` - Debounce/cancellation
- `SuggestionCache.ts` - Client cache
- `applySuggestion.ts` - Text replacement
- `updateHighlightSnapshot.ts` - Span updates
- `signalUtils.ts` - AbortSignal utilities
- `textQuoteRelocator.ts` - Robust text matching

**API:**

- `enhancementSuggestionsApi.ts` - API calls

**Components:**

- `SuggestionsPanel.tsx` - UI component
- `PromptCanvas.tsx` - Canvas with selection
- `PromptResultsSection.tsx` - Results wrapper

### Backend (13 files)

**Core Services:**

- `EnhancementService.ts` - Main orchestrator
- `SuggestionGenerationService.ts` - Generation
- `SuggestionProcessingService.ts` - Processing pipeline

**Specialized Services:**

- `ContrastiveDiversityEnforcer.ts` - Batch generation
- `SuggestionDeduplicator.ts` - Diversity enforcement
- `SuggestionValidationService.ts` - Validation/sanitization
- `CategoryAlignmentService.ts` - Category validation
- `FallbackRegenerationService.ts` - Fallback regeneration
- `VideoContextDetectionService.ts` - Video detection
- `SuggestionProcessor.ts` - Result building

**Configuration:**

- `schemas.ts` - JSON schemas
- `CacheKeyFactory.ts` - Cache key generation

**Routes:**

- `enhancement.routes.ts` - Express routes

---

## Key Algorithms

### 1. Token-Based Text Relocation

**File:** `client/src/utils/textQuoteRelocator.ts`

**Purpose:** Find text matches despite whitespace differences

**Algorithm:**

1. Tokenize text (split on whitespace, lowercase)
2. Find all candidate matches (exact + fuzzy regex)
3. Score each candidate:
   - Left context: Match tokens backwards (20-word window)
   - Right context: Match tokens forwards (20-word window)
   - Distance penalty: Prefer matches near `preferIndex`
4. Return highest-scoring match

**Key Feature:** Whitespace-agnostic matching

### 2. Contrastive Decoding

**File:** `server/src/services/enhancement/services/ContrastiveDiversityEnforcer.ts`

**Purpose:** Prevent "visual collapse" in suggestions

**Algorithm:**

1. Generate Batch 1 (4 suggestions, temp 0.4, no constraints)
2. Generate Batch 2 (4 suggestions, temp 0.5, negative constraint vs Batch 1)
3. Generate Batch 3 (4 suggestions, temp 0.6, negative constraint vs Batches 1+2)
4. Combine all batches (12 total)

**Negative Constraint Format:**

```
"Do not use concepts, phrases, or visual approaches similar to: [previous suggestions]"
```

### 3. Jaccard Similarity

**File:** `server/src/services/enhancement/services/SuggestionDeduplicator.ts`

**Purpose:** Measure similarity between suggestions

**Formula:**

```
similarity = |intersection(words1, words2)| / |union(words1, words2)|
```

**Threshold:** 0.7 (replace if exceeded)

### 4. Cache Key Generation

**File:** `server/src/services/enhancement/utils/CacheKeyFactory.ts`

**Components:**

- Highlighted text
- Context before/after (100 chars)
- Full prompt hash (first 500 chars)
- Video constraints mode
- Edit fingerprint (last 5 edits)
- Model target, prompt section

**Purpose:** Ensure cache hits for identical requests

---

## Performance Optimizations

### 1. Multi-Layer Caching

- **Client Cache**: 5-minute TTL, max 50 entries (prevents API spam)
- **Server Cache**: 1-hour TTL, Redis/memory (reduces LLM calls)

### 2. Request Optimization

- **Debouncing**: 150ms trailing-edge (waits for user to stop selecting)
- **Deduplication**: Prevents duplicate requests for same text
- **Cancellation**: Aborts in-flight requests on new selection
- **Early Returns**: Mode checks, empty text checks

### 3. Batch Processing

- **Contrastive Decoding**: Generates 12 suggestions in 3 batches (parallelizable)
- **Span Processing**: Batch sanitization and validation

### 4. Lazy Loading

- **Loading State**: Only shown after debounce fires
- **Progressive Enhancement**: Fallbacks only if needed

---

## Error Handling

### Frontend

**CancellationError:**

- Silent return (no state update)
- User selected new text

**Timeout:**

- Shows error state with retry button
- 3-second timeout

**Network Errors:**

- Shows error state
- Provides retry callback

### Backend

**Validation Errors:**

- Returns 400 with error message
- Logged with request ID

**Generation Errors:**

- Falls back to standard generation
- Logs error but continues

**Processing Errors:**

- Applies fallback strategies
- Returns empty suggestions if all fail

---

## Metrics & Monitoring

### Frontend Metrics

- Request timing (debounce delay, API call time)
- Cache hit rate
- Error rates

### Backend Metrics

- Total time
- Cache check time
- Model detection time
- Section detection time
- Prompt build time
- LLM call time
- Post-processing time

**Logging:**

- Request/response logging
- Performance metrics
- Error tracking
- Diversity metrics (contrastive decoding)

---

## Future Improvements

1. **Parallel Batch Generation**: Generate contrastive batches in parallel
2. **Smarter Caching**: Cache based on semantic similarity, not exact match
3. **Progressive Loading**: Stream suggestions as they're generated
4. **User Feedback Loop**: Learn from user selections
5. **A/B Testing**: Test different generation strategies

---

## Related Documentation

- [Workflow Documentation](../workflow_documentation.md)
- [Architecture Guide](../architecture/README.md)
- [Refactoring Patterns](../architecture/REFACTORING_PATTERN.md)
