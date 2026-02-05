# 🎭 Face Swap Days 2-3 - Quick Testing Guide

## 🚀 How to Test the Face Swap

1. **Open the app**: `http://localhost:5173`
2. **Click**: "🎭 Face Swap Demo (Day 1)" button
3. **Allow webcam access**
4. **Get 2 people** in front of the camera
5. **Wait** for both faces to be detected (green + purple dots)
6. **Click**: "🔄 Enable Swap" button
7. **BOOM!** 🎉 Your faces are swapped!

## ✅ What You Should See

### Before Swap (Landmarks Only)
- **Person 1**: Green dots (468 landmarks)
- **Person 2**: Purple dots (468 landmarks)
- **Swap button**: Enabled (clickable)

### After Enabling Swap
- **Person 1's face** appears on **Person 2's body**
- **Person 2's face** appears on **Person 1's body**
- **"SWAP: ON"** text appears on screen
- **Skin tones** are matched automatically
- **Edges** are blended smoothly

### Optional: Hide Landmarks
- Click "👁️ Hide Landmarks" to see clean swap without green/purple dots
- The swap continues working in the background

## 🎯 Quick Tests

| Test | Action | Expected Result |
|------|--------|-----------------|
| **2 Faces** | Both people visible | Swap button enabled |
| **Enable Swap** | Click swap button | Faces swap instantly |
| **Move Around** | Move heads | Swap follows in real-time |
| **Hide Landmarks** | Toggle landmarks off | Clean swap visible |
| **1 Face Only** | One person leaves | Swap button disabled |

## 🎨 What's Happening Behind the Scenes

1. **Face Detection** (Day 1): MediaPipe finds 468 landmarks on each face
2. **Face Extraction** (Day 2): Crops face regions with bounding boxes
3. **Face Alignment** (Day 2): Calculates rotation and alignment
4. **Face Swap** (Day 3): 
   - Extracts both face regions
   - Matches skin tones (color correction)
   - Scales faces to fit target areas
   - Blends with smooth edges
   - Renders swapped result

## ⚡ Performance

- **FPS**: Should stay 20-40 FPS (slightly lower than detection-only due to swap processing)
- **Latency**: < 50ms swap processing time
- **Quality**: Real-time with automatic skin tone matching

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Swap button disabled | Need exactly 2 faces detected |
| Swap looks weird | Ensure good lighting on both faces |
| Low FPS | Normal - swap is computationally intensive |
| Faces not aligned | Try facing camera more directly |

## 🎓 Technical Implementation

**Files Created:**
- `faceExtraction.ts` - Extract face regions and bounding boxes
- `faceAlignment.ts` - Align faces to standard pose
- `faceSwapProcessor.ts` - Swap algorithm with blending

**Algorithm:**
1. Calculate bounding boxes from landmarks
2. Extract face regions as ImageData
3. Match skin tones (color correction)
4. Scale faces to target sizes
5. Create blend masks for smooth edges
6. Composite swapped faces onto original frame

**Optimizations:**
- Simple swap algorithm for real-time performance
- Reuses canvas elements
- Minimal alpha blending (85% opacity)
- No complex transformations (saves processing time)

---

**Days 1-3 Complete!** 🎉 You now have a fully working real-time face swap!
