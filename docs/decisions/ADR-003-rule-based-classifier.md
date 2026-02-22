# ADR-003: Rule-based vs ML Gesture Classifier

**Status:** Accepted  
**Date:** 2026-02-22  
**Context:** The gesture pipeline needs to map 21 keypoints to a named gesture label.

---

## Decision

Use a **rule-based geometric classifier** (`GestureVocabulary`) initially.  
Design it as a drop-in replaceable component so an MLP can substitute `classify()` later.

---

## Rationale

### Why rule-based now

| Property | Rule-based | Trained MLP |
|----------|-----------|------------|
| Training data required | Zero | ~500+ samples/gesture |
| Explainability | 100% — finger state logic is readable | Black box |
| Accuracy (simple poses) | High (95%) | High (97%+) |
| Accuracy (edge cases) | May miss | Better with enough data |
| Deployment size | 0 bytes | ~100KB model weights |
| Dev time | 2 hours | 1-2 weeks (data collection + training) |

For an interview project with 6 defined gestures and a clear hand pose spec, rule-based is the right engineering choice.

### How to replace with MLP later

The `classify(landmarks: List[Dict]) -> GestureResult` signature is the only interface contract.

To train and deploy a neural classifier:
1. Log `(landmarks, label)` pairs from real sessions (opt-in consent)
2. Train `sklearn.MLPClassifier(hidden_layer_sizes=(64, 32))` on 63-dim input
3. Export with `joblib.dump(model, 'gesture_model.pkl')`
4. Swap `GestureVocabulary.classify()` to load the model and call `model.predict_proba()`

No other code changes required.

---

## Consequences

- ✅ Immediately usable with zero training data
- ✅ Fully explainable — finger state logic is readable in code
- ✅ Designed for future ML swap without touching pipeline or API contracts
- ⚠️ May misclassify oblique hand orientations (e.g. hand tilted 45°)
- ⚠️ Thumb detection is simplified (left-hand vs right-hand orientation not handled)
