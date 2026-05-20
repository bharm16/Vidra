# API Reference

Complete API documentation for the Prompt Optimizer platform.

## Table of Contents

- [Overview](#overview)
- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Optimization Endpoints](#optimization-endpoints)
- [Span Labeling Endpoints](#span-labeling-endpoints)
- [Enhancement Endpoints](#enhancement-endpoints)
- [Video Concept Endpoints](#video-concept-endpoints)
- [Preview Endpoints](#preview-endpoints)
- [Health & Metrics Endpoints](#health--metrics-endpoints)
- [Webhooks](#webhooks)
- [SDK Examples](#sdk-examples)

---

## Overview

The Prompt Optimizer API is a RESTful API that provides:

- Video prompt optimization (specialized for AI video generation)
- Real-time span labeling and text categorization
- AI-powered enhancement suggestions
- Video concept building and validation
- Server-Sent Events (SSE) for streaming responses

**API Version:** v1
**Content-Type:** `application/json`
**Rate Limit:** 60 requests/minute (authenticated), 10 requests/minute (unauthenticated)

---

## Base URLs

```
Development:  http://localhost:3001/api
Staging:      https://staging-api.promptbuilder.com/api
Production:   https://api.promptbuilder.com/api
```

---

## Authentication

### API Key Authentication

Include your API key in the request header (preferred):

```http
Authorization: Bearer YOUR_API_KEY
```

Legacy header support (still accepted):

```http
X-API-Key: YOUR_API_KEY
```

### User Authentication (Firebase)

Endpoints that charge credits (video previews, billing) also require a Firebase ID token:

```http
X-Firebase-Token: FIREBASE_ID_TOKEN
```

### Generating API Keys

```bash
# Generate a secure API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the generated key to your `.env` file:

```env
ALLOWED_API_KEYS=your_generated_api_key_here
```

For single-key setups, `API_KEY` is also accepted, but `ALLOWED_API_KEYS` is preferred for rotation.

### Example Request

```bash
curl -X POST https://api.promptbuilder.com/api/optimize \
  -H "Authorization: Bearer your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A person walking on a beach",
    "mode": "video"
  }'
```

---

## Rate Limiting

### Rate Limit Headers

Every API response includes rate limit information:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1640000000
```

### Rate Limit Tiers

| Tier            | Requests/Minute | Requests/Hour |
| --------------- | --------------- | ------------- |
| Unauthenticated | 10              | 100           |
| Authenticated   | 60              | 1000          |
| Premium         | 300             | 5000          |
| Enterprise      | Unlimited       | Unlimited     |

### Rate Limit Response

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "ErrorType",
  "message": "Human-readable error message",
  "statusCode": 400,
  "timestamp": "2025-11-25T12:00:00.000Z",
  "requestId": "req_abc123xyz",
  "details": {
    "field": "prompt",
    "issue": "Prompt cannot be empty"
  }
}
```

### HTTP Status Codes

| Code | Meaning               | Description                     |
| ---- | --------------------- | ------------------------------- |
| 200  | OK                    | Request successful              |
| 201  | Created               | Resource created successfully   |
| 400  | Bad Request           | Invalid request parameters      |
| 401  | Unauthorized          | Missing or invalid API key      |
| 403  | Forbidden             | Insufficient permissions        |
| 404  | Not Found             | Resource not found              |
| 429  | Too Many Requests     | Rate limit exceeded             |
| 500  | Internal Server Error | Server error                    |
| 503  | Service Unavailable   | Service temporarily unavailable |

### Common Error Types

**ValidationError**

```json
{
  "error": "ValidationError",
  "message": "Validation failed",
  "details": {
    "prompt": "Prompt must be between 1 and 10000 characters"
  }
}
```

**RateLimitError**

```json
{
  "error": "RateLimitError",
  "message": "Rate limit exceeded",
  "retryAfter": 30
}
```

**CircuitBreakerError**

```json
{
  "error": "CircuitBreakerError",
  "message": "Service temporarily unavailable due to high error rate",
  "retryAfter": 60
}
```

---

## Optimization Endpoints

### POST /api/optimize

Single-stage prompt optimization (backward compatible).

**Endpoint:** `POST /api/optimize`

**Request Body:**

```json
{
  "prompt": "string (required, 1-10000 chars)",
  "mode": "string (optional, defaults to 'video')",
  "context": "object (optional)",
  "brainstormContext": "object (optional)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/optimize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "prompt": "A person walking on a beach",
    "mode": "video"
  }'
```

**Response:** `200 OK`

```json
{
  "optimizedPrompt": "Wide shot: A woman in her early 30s with flowing auburn hair and a white linen dress walks barefoot along a pristine beach at golden hour...",
  "metadata": {
    "mode": "video",
    "modelUsed": "gpt-4o-mini",
    "provider": "openai",
    "processingTime": 1234,
    "tokenUsage": {
      "input": 45,
      "output": 312
    },
    "qualityScore": 87,
    "templateVersion": "2.0"
  }
}
```

**Modes:**

- `default` - General-purpose optimization
- `reasoning` - Deep thinking for o1/o3 models
- `research` - Research plan generation
- `socratic` - Educational question sequences
- `video` - AI video generation prompts

---

### POST /api/optimize-stream

Two-stage optimization with Server-Sent Events (SSE) streaming.

**Endpoint:** `POST /api/optimize-stream`

**Request Body:**

```json
{
  "prompt": "string (required)",
  "mode": "string (optional)",
  "context": "object (optional)",
  "brainstormContext": "object (optional)"
}
```

**Response:** Server-Sent Events (SSE) stream

**Event Types:**

1. **draft** - Fast draft version

```
event: draft
data: {
  "optimizedPrompt": "Quick draft version...",
  "metadata": {
    "stage": "draft",
    "provider": "groq",
    "processingTime": 287
  }
}
```

2. **spans** - Span labels (parallel with draft)

```
event: spans
data: {
  "spans": [
    {
      "id": "span-1",
      "text": "sorting function",
      "role": "action",
      "category": "action.technical"
    }
  ]
}
```

3. **refined** - Final optimized version

```
event: refined
data: {
  "optimizedPrompt": "Enhanced version with improvements...",
  "metadata": {
    "stage": "refined",
    "provider": "openai",
    "processingTime": 2134,
    "qualityScore": 92
  }
}
```

4. **done** - Completion signal

```
event: done
data: {"complete": true}
```

**Client-Side Example (JavaScript):**

```javascript
const eventSource = new EventSource("/api/optimize-stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer your_api_key",
  },
  body: JSON.stringify({
    prompt: "A person walking on a beach",
    mode: "video",
  }),
});

eventSource.addEventListener("draft", (e) => {
  const data = JSON.parse(e.data);
  console.log("Draft:", data.optimizedPrompt);
});

eventSource.addEventListener("spans", (e) => {
  const data = JSON.parse(e.data);
  console.log("Spans:", data.spans);
});

eventSource.addEventListener("refined", (e) => {
  const data = JSON.parse(e.data);
  console.log("Refined:", data.optimizedPrompt);
});

eventSource.addEventListener("done", (e) => {
  eventSource.close();
});
```

---

## Span Labeling Endpoints

### POST /llm/label-spans

Label text spans with semantic categories for highlighting.

**Endpoint:** `POST /llm/label-spans`

**Request Body:**

```json
{
  "text": "string (required, 1-50000 chars)",
  "policy": "string (required, highlighting|extraction)",
  "options": {
    "maxSpans": "number (optional, default: 10, max: 50)",
    "minConfidence": "number (optional, default: 0.7, range: 0-1)",
    "categories": "array (optional, filter by categories)"
  }
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/llm/label-spans \
  -H "Content-Type: application/json" \
  -d '{
    "text": "A woman in her 30s walks on a beach at sunset",
    "policy": "highlighting",
    "options": {
      "maxSpans": 10,
      "minConfidence": 0.7
    }
  }'
```

**Response:** `200 OK`

```json
{
  "spans": [
    {
      "id": "span-1",
      "text": "woman in her 30s",
      "start": 2,
      "end": 18,
      "role": "subject",
      "category": "subject.person",
      "confidence": 0.95,
      "metadata": {
        "details": ["age", "gender"]
      }
    },
    {
      "id": "span-2",
      "text": "walks",
      "start": 19,
      "end": 24,
      "role": "action",
      "category": "action.movement",
      "confidence": 0.92
    },
    {
      "id": "span-3",
      "text": "beach",
      "start": 30,
      "end": 35,
      "role": "location",
      "category": "location.outdoor",
      "confidence": 0.89
    },
    {
      "id": "span-4",
      "text": "sunset",
      "start": 39,
      "end": 45,
      "role": "time",
      "category": "time.daypart",
      "confidence": 0.94
    }
  ],
  "meta": {
    "templateVersion": "2.0",
    "provider": "groq",
    "model": "llama-3.1-8b-instant",
    "processingTime": 234,
    "fromCache": false,
    "chunkCount": 1
  }
}
```

**Span Schema:**

| Field      | Type   | Description                                     |
| ---------- | ------ | ----------------------------------------------- |
| id         | string | Unique span identifier                          |
| text       | string | The labeled text span                           |
| start      | number | Start position in text (0-indexed)              |
| end        | number | End position in text                            |
| role       | string | Semantic role (subject, action, location, etc.) |
| category   | string | Hierarchical category (e.g., subject.person)    |
| confidence | number | Confidence score (0-1)                          |
| metadata   | object | Additional span information                     |

**Available Categories:**

- `subject.person` - People
- `subject.object` - Objects
- `subject.animal` - Animals
- `action.movement` - Movement actions
- `action.technical` - Technical actions
- `location.indoor` - Indoor locations
- `location.outdoor` - Outdoor locations
- `time.daypart` - Time of day
- `time.duration` - Duration
- `camera.angle` - Camera angles
- `camera.movement` - Camera movements
- `lighting.quality` - Lighting quality
- `lighting.direction` - Light direction
- `style.visual` - Visual style
- `mood.emotional` - Emotional mood

---

### POST /llm/label-spans-batch

Batch endpoint for processing multiple span labeling requests concurrently.

**Endpoint:** `POST /llm/label-spans-batch`

**Request Body:**

```json
{
  "requests": [
    {
      "text": "string (required)",
      "policy": "string (required)",
      "options": "object (optional)"
    }
  ]
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/llm/label-spans-batch \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "text": "A woman walks on a beach",
        "policy": "highlighting"
      },
      {
        "text": "Close-up of hands typing on a keyboard",
        "policy": "highlighting"
      }
    ]
  }'
```

**Response:** `200 OK`

```json
{
  "results": [
    {
      "spans": [...],
      "meta": {...}
    },
    {
      "spans": [...],
      "meta": {...}
    }
  ],
  "metadata": {
    "totalRequests": 2,
    "successfulRequests": 2,
    "failedRequests": 0,
    "totalProcessingTime": 456
  }
}
```

**Performance:**

- **60% reduction** in API calls under concurrent load
- Requests processed in parallel
- Single LLM API call for multiple texts
- Automatic request batching (up to 10 requests per batch)

---

## Enhancement Endpoints

### POST /api/enhancement/suggestions

Get AI-powered enhancement suggestions for selected text.

**Endpoint:** `POST /api/enhancement/suggestions`

**Request Body:**

```json
{
  "highlightedText": "string (required)",
  "fullPrompt": "string (required)",
  "contextBefore": "string (optional)",
  "contextAfter": "string (optional)",
  "originalUserPrompt": "string (optional)",
  "brainstormContext": "object (optional)",
  "highlightedCategory": "string (optional)",
  "highlightedCategoryConfidence": "number (optional)",
  "highlightedPhrase": "string (optional)",
  "allLabeledSpans": "array (optional)",
  "nearbySpans": "array (optional)",
  "editHistory": "array (optional)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/enhancement/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "highlightedText": "a person walking",
    "fullPrompt": "a person walking on a beach at sunset",
    "originalUserPrompt": "beach scene",
    "highlightedCategory": "subject",
    "highlightedCategoryConfidence": 0.9
  }'
```

**Response:** `200 OK`

```json
{
  "suggestions": [
    {
      "text": "a woman in her 30s with flowing auburn hair walking gracefully",
      "category": "subject",
      "explanation": "Adds specific demographic details, visual characteristics, and movement quality",
      "confidence": 0.92
    },
    {
      "text": "an elderly man with weathered features walking slowly with a cane",
      "category": "subject",
      "explanation": "Provides age, visual details, pace, and props for character depth",
      "confidence": 0.88
    },
    {
      "text": "a young couple walking hand-in-hand",
      "category": "subject",
      "explanation": "Introduces relationship dynamic and physical interaction",
      "confidence": 0.85
    }
  ],
  "fromCache": false,
  "metadata": {
    "promptMode": "simple",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "processingTime": 813,
    "contextUsed": ["originalUserPrompt", "highlightedCategory"]
  }
}
```

**Suggestion Schema:**

| Field       | Type   | Description                           |
| ----------- | ------ | ------------------------------------- |
| text        | string | The suggested replacement text        |
| category    | string | Category alignment                    |
| explanation | string | Why this suggestion improves the text |
| confidence  | number | Confidence score (0-1)                |

---

### POST /api/enhancement/custom-suggestions

Get custom enhancement suggestions based on user's specific request.

**Endpoint:** `POST /api/enhancement/custom-suggestions`

**Request Body:**

```json
{
  "highlightedText": "string (required)",
  "customRequest": "string (required)",
  "fullPrompt": "string (required)",
  "context": "object (optional)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/enhancement/custom-suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "highlightedText": "sunset",
    "customRequest": "make it more dramatic and cinematic",
    "fullPrompt": "A beach at sunset"
  }'
```

**Response:** `200 OK`

```json
{
  "suggestions": [
    {
      "text": "fiery sunset with deep orange and purple hues bleeding across the sky",
      "category": "lighting",
      "explanation": "Adds dramatic color palette and vivid imagery"
    },
    {
      "text": "stormy sunset with dark clouds parting to reveal golden light",
      "category": "lighting",
      "explanation": "Creates tension and visual drama through weather contrast"
    }
  ],
  "metadata": {
    "processingTime": 924
  }
}
```

---

### POST /api/enhancement/scene-change

Detect if a prompt change describes a new scene (video mode).

**Endpoint:** `POST /api/enhancement/scene-change`

**Request Body:**

```json
{
  "changedField": "string (required)",
  "newValue": "string (required)",
  "oldValue": "string (required)",
  "fullPrompt": "string (required)",
  "affectedFields": "array (optional)",
  "sectionHeading": "string (optional)",
  "sectionContext": "string (optional)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/enhancement/scene-change \
  -H "Content-Type: application/json" \
  -d '{
    "changedField": "location",
    "newValue": "mountain peak",
    "oldValue": "beach",
    "fullPrompt": "Current prompt text",
    "affectedFields": ["location", "lighting"]
  }'
```

**Response:** `200 OK`

```json
{
  "isSceneChange": true,
  "confidence": 0.89,
  "reason": "Different location and environmental context",
  "affectedElements": ["location", "lighting", "mood"],
  "recommendation": "Consider starting a new scene or adjusting other elements to match"
}
```

---

## Video Concept Endpoints

### POST /api/video/suggestions

Get creative suggestions for video concept elements.

**Endpoint:** `POST /api/video/suggestions`

**Request Body:**

```json
{
  "elementType": "string (required, subject|action|location|camera|lighting|style|mood)",
  "currentValue": "string (optional)",
  "context": "object (optional)",
  "concept": "string (optional)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/video/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "elementType": "subject",
    "currentValue": "elderly historian",
    "context": {
      "location": "sun-drenched wheat field",
      "mood": "nostalgic warmth"
    },
    "concept": "Quiet character portrait"
  }'
```

**Response:** `200 OK`

```json
{
  "suggestions": [
    {
      "text": "elderly historian with weathered hands polishing a silver pocket watch",
      "explanation": "Builds on the subject while reinforcing the nostalgic tone with a prop that adds storytelling depth",
      "compatibility": 0.95
    },
    {
      "text": "elderly historian shielding his notes beneath an ancient oak",
      "explanation": "Keeps the subject consistent and resolves potential location conflicts",
      "compatibility": 0.88
    }
  ],
  "metadata": {
    "processingTime": 1045
  }
}
```

---

## Preview Endpoints

### POST /api/preview/generate

Generate an image preview from a prompt.

**Request Body:**

```json
{
  "prompt": "string (required)",
  "aspectRatio": "string (optional)"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "imageUrl": "https://...",
    "metadata": {
      "aspectRatio": "16:9",
      "model": "flux-schnell",
      "duration": 1200,
      "generatedAt": "2025-11-25T12:00:00.000Z"
    }
  }
}
```

### POST /api/preview/video/generate

Queue a video preview job. Requires API key **and** Firebase ID token (`X-Firebase-Token`).

**Request Body:**

```json
{
  "prompt": "string (required)",
  "aspectRatio": "string (optional)",
  "model": "string (optional)",
  "startImage": "string (optional)",
  "inputReference": "string (optional)",
  "generationParams": "object (optional)",
  "characterAssetId": "string (optional)",
  "autoKeyframe": "boolean (optional, defaults to true)"
}
```

**Behavior notes:**

- `startImage` only → direct i2v
- `characterAssetId` only (with `autoKeyframe=true`) → PuLID keyframe → i2v
- `startImage` + `characterAssetId` → face-swap preprocessing → i2v

**Response:** `202 Accepted`

```json
{
  "success": true,
  "jobId": "job_123",
  "status": "queued",
  "creditsReserved": 40,
  "creditsDeducted": 42,
  "keyframeGenerated": false,
  "keyframeUrl": null,
  "faceSwapApplied": true,
  "faceSwapUrl": "https://..."
}
```

### GET /api/preview/video/jobs/:jobId

Check status for a queued video preview job. Returns a fresh URL when complete.
Signed URLs may expire; call this endpoint again to refresh access.

**Response:** `200 OK`

```json
{
  "success": true,
  "jobId": "job_123",
  "status": "completed",
  "videoUrl": "https://...",
  "assetId": "asset_abc",
  "contentType": "video/mp4",
  "creditsReserved": 5
}
```

If the job failed:

```json
{
  "success": true,
  "jobId": "job_123",
  "status": "failed",
  "error": "Video generation failed"
}
```

---

### POST /api/video/validate

Validate element compatibility and detect conflicts.

**Endpoint:** `POST /api/video/validate`

**Request Body:**

```json
{
  "elementType": "string (required)",
  "value": "string (required)",
  "elements": "object (required, current concept elements)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/video/validate \
  -H "Content-Type: application/json" \
  -d '{
    "elementType": "location",
    "value": "sun-drenched wheat field",
    "elements": {
      "subject": "elderly historian beneath an ancient oak tree",
      "mood": "nostalgic warmth"
    }
  }'
```

**Response:** `200 OK`

```json
{
  "compatibility": {
    "score": 0.42,
    "feedback": "Subject is under an oak tree while location says wheat field - spatial conflict",
    "conflicts": ["subject vs. location"],
    "suggestions": [
      "Clarify if the historian is in the field or under the tree",
      "Consider: 'wheat field with a solitary ancient oak'"
    ]
  },
  "conflicts": [
    {
      "elements": ["subject", "location"],
      "severity": "medium",
      "message": "The location and subject describe different spatial setups",
      "resolution": "Either move the subject into the wheat field or adjust the location to include the oak tree"
    }
  ]
}
```

---

### POST /api/video/complete

Auto-complete missing elements and get smart defaults.

**Endpoint:** `POST /api/video/complete`

**Request Body:**

```json
{
  "existingElements": "object (required)",
  "concept": "string (optional)",
  "smartDefaultsFor": "string (optional, specific element to get defaults for)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/video/complete \
  -H "Content-Type: application/json" \
  -d '{
    "existingElements": {
      "subject": "elderly historian with weathered hands",
      "location": "sun-drenched wheat field"
    },
    "concept": "Quiet character portrait",
    "smartDefaultsFor": "camera"
  }'
```

**Response:** `200 OK`

```json
{
  "suggestions": {
    "subject": "elderly historian with weathered hands",
    "location": "sun-drenched wheat field",
    "action": "gently polishing an heirloom pocket watch",
    "mood": "nostalgic warmth",
    "style": "shot on 35mm film with soft backlight",
    "camera": "medium close-up from waist height",
    "lighting": "warm golden hour light filtering through the wheat"
  },
  "smartDefaults": {
    "camera": {
      "angle": "medium close-up from waist height",
      "movement": "gentle dolly in",
      "lens": "50mm at f/2",
      "framingNote": "Rule of thirds placement, subject in right third"
    }
  },
  "metadata": {
    "completedElements": ["action", "mood", "style", "camera", "lighting"],
    "processingTime": 1523
  }
}
```

---

### POST /api/video/variations

Generate alternative takes on the current concept.

**Endpoint:** `POST /api/video/variations`

**Request Body:**

```json
{
  "elements": "object (required)",
  "concept": "string (optional)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/video/variations \
  -H "Content-Type: application/json" \
  -d '{
    "elements": {
      "subject": "elderly historian with weathered hands",
      "location": "sun-drenched wheat field",
      "action": "polishing an heirloom pocket watch"
    },
    "concept": "Quiet character portrait"
  }'
```

**Response:** `200 OK`

```json
{
  "variations": [
    {
      "name": "Dusty Archives",
      "description": "Moves the historian indoors surrounded by parchment scrolls",
      "elements": {
        "subject": "elderly historian with weathered hands",
        "location": "dimly lit archive with floor-to-ceiling shelves",
        "action": "carefully unfurling an ancient map",
        "lighting": "shaft of dusty light from a high window",
        "mood": "mysterious discovery"
      },
      "changes": [
        "Relocates scene to archive",
        "Cool, desaturated palette",
        "Adds mystery element"
      ]
    },
    {
      "name": "Golden Hour Memories",
      "description": "Keeps the wheat field but introduces family photographs",
      "elements": {
        "subject": "elderly historian with weathered hands",
        "location": "sun-drenched wheat field",
        "action": "gazing at old family photographs as they flutter in the breeze",
        "lighting": "warm golden hour backlight",
        "mood": "bittersweet nostalgia"
      },
      "changes": [
        "Adds prop storytelling",
        "Warmer lighting emphasis",
        "Deepens emotional tone"
      ]
    }
  ],
  "metadata": {
    "processingTime": 1876
  }
}
```

---

### POST /api/video/parse

Convert free-form concept paragraph into structured elements.

**Endpoint:** `POST /api/video/parse`

**Request Body:**

```json
{
  "concept": "string (required)"
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/video/parse \
  -H "Content-Type: application/json" \
  -d '{
    "concept": "An aging jazz musician plays a final set under flickering club lights, smoke drifting through the air."
  }'
```

**Response:** `200 OK`

```json
{
  "elements": {
    "subject": "aging jazz musician with weathered trumpet",
    "action": "playing a heartfelt final set",
    "location": "smoke-filled underground jazz club",
    "lighting": "flickering warm club lights with atmospheric haze",
    "mood": "melancholic and soulful",
    "style": "shot on 16mm film with warm practical lighting",
    "camera": "medium shot, slow push-in during performance"
  },
  "metadata": {
    "parsedElements": 7,
    "confidence": 0.91,
    "processingTime": 1234
  }
}
```

---

## Health & Metrics Endpoints

### GET /health

Basic health check.

**Endpoint:** `GET /health`

**Response:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2025-11-25T12:00:00.000Z",
  "uptime": 3600
}
```

---

### GET /health/ready

Readiness probe - checks all dependencies.

**Endpoint:** `GET /health/ready`

**Response:** `200 OK`

```json
{
  "status": "ready",
  "checks": {
    "firebase": "ok",
    "redis": "ok",
    "openai": "ok",
    "groq": "ok"
  },
  "timestamp": "2025-11-25T12:00:00.000Z"
}
```

**Response:** `503 Service Unavailable` (if any check fails)

```json
{
  "status": "not_ready",
  "checks": {
    "firebase": "ok",
    "redis": "error",
    "openai": "ok",
    "groq": "ok"
  },
  "errors": ["Redis connection failed"]
}
```

---

### GET /health/live

Liveness probe - checks if process is alive.

**Endpoint:** `GET /health/live`

**Response:** `200 OK`

```json
{
  "status": "alive",
  "timestamp": "2025-11-25T12:00:00.000Z"
}
```

---

### GET /stats

System statistics in JSON format.

**Endpoint:** `GET /stats`

**Response:** `200 OK`

```json
{
  "server": {
    "uptime": 3600,
    "nodeVersion": "20.10.0",
    "memory": {
      "rss": 123456789,
      "heapTotal": 98765432,
      "heapUsed": 87654321,
      "external": 1234567
    },
    "cpu": {
      "user": 12345,
      "system": 6789
    }
  },
  "api": {
    "totalRequests": 12345,
    "requestsPerMinute": 45,
    "averageResponseTime": 234,
    "errorRate": 0.001
  },
  "cache": {
    "memory": {
      "hits": 5678,
      "misses": 1234,
      "hitRate": 0.821,
      "size": 456
    },
    "redis": {
      "hits": 1234,
      "misses": 567,
      "hitRate": 0.685,
      "connected": true
    }
  },
  "llm": {
    "openai": {
      "calls": 890,
      "errors": 5,
      "averageDuration": 1234,
      "circuitBreakerState": "closed"
    },
    "groq": {
      "calls": 1234,
      "errors": 2,
      "averageDuration": 287,
      "circuitBreakerState": "closed"
    }
  }
}
```

---

## Webhooks

### Event Types

- `optimization.completed` - Optimization finished
- `span_labeling.completed` - Span labeling finished
- `error.occurred` - Error occurred

### Webhook Payload

```json
{
  "event": "optimization.completed",
  "timestamp": "2025-11-25T12:00:00.000Z",
  "data": {
    "requestId": "req_abc123",
    "userId": "user_xyz789",
    "mode": "video",
    "prompt": "Original prompt",
    "result": "Optimized prompt",
    "metadata": {}
  }
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { PromptOptimizer } from "@prompt-builder/sdk";

const client = new PromptOptimizer({
  apiKey: "your_api_key",
  baseUrl: "https://api.promptbuilder.com",
});

// Single optimization
const result = await client.optimize({
  prompt: "A person walking on a beach",
  mode: "video",
});

// Streaming optimization
await client.optimizeStream(
  {
    prompt: "A person walking on a beach",
    mode: "video",
  },
  {
    onDraft: (draft) => console.log("Draft:", draft),
    onSpans: (spans) => console.log("Spans:", spans),
    onRefined: (refined) => console.log("Refined:", refined),
    onComplete: () => console.log("Done!"),
  },
);

// Span labeling
const spans = await client.labelSpans({
  text: "A woman walks on a beach",
  policy: "highlighting",
});
```

### Python

```python
from prompt_builder import PromptOptimizer

client = PromptOptimizer(
    api_key='your_api_key',
    base_url='https://api.promptbuilder.com'
)

# Single optimization
result = client.optimize(
    prompt='A person walking on a beach',
    mode='video'
)

# Span labeling
spans = client.label_spans(
    text='A woman walks on a beach',
    policy='highlighting'
)
```

---

## Best Practices

### 1. Use Streaming for Better UX

For user-facing applications, use `/api/optimize-stream` for progressive loading:

- Show draft immediately (~300ms)
- Display span highlights in parallel
- Update with refined version when ready

### 2. Implement Retry Logic

```javascript
async function optimizeWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.optimize({ prompt });
    } catch (error) {
      if (error.statusCode === 429) {
        // Rate limit - wait before retry
        await sleep(error.retryAfter * 1000);
      } else if (error.statusCode >= 500 && i < maxRetries - 1) {
        // Server error - exponential backoff
        await sleep(Math.pow(2, i) * 1000);
      } else {
        throw error;
      }
    }
  }
}
```

### 3. Cache Aggressively

Span labeling and enhancement suggestions are expensive. Cache results client-side:

```javascript
const cache = new Map();

async function labelSpansWithCache(text) {
  const cacheKey = `spans:${text}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const result = await client.labelSpans({ text });
  cache.set(cacheKey, result);
  return result;
}
```

### 4. Handle Circuit Breaker States

Monitor circuit breaker state and provide fallbacks:

```javascript
try {
  const result = await client.optimize({ prompt });
} catch (error) {
  if (error.error === "CircuitBreakerError") {
    // Use cached version or simpler fallback
    return getCachedVersion(prompt);
  }
}
```

---

## Rate Limit Optimization

### Batch Requests

Use batch endpoints when processing multiple items:

```javascript
// Instead of:
const results = await Promise.all(
  texts.map((text) => client.labelSpans({ text })),
);

// Use:
const results = await client.labelSpansBatch({
  requests: texts.map((text) => ({ text, policy: "highlighting" })),
});
```

### Request Coalescing

The API automatically coalesces identical concurrent requests:

```javascript
// These two identical requests will only trigger one LLM call
const [result1, result2] = await Promise.all([
  client.labelSpans({ text: "Same text" }),
  client.labelSpans({ text: "Same text" }),
]);
```

---

**Last Updated:** November 2025
**API Version:** v1.0.0
