import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

print("Loading Data and Model...")
df = pd.read_csv('ml_features_100k.csv')
model = joblib.load('mule_xgboost_model.pkl')

if 'is_mule' not in df.columns:
    print("Error: 'is_mule' column not found.")
    exit()

y = df['is_mule']
X = df.drop(columns=['account_id', 'is_mule'], errors='ignore')
expected_cols = model.get_booster().feature_names
X = X[expected_cols]

# CRITICAL: only test on a held-out slice the model has never trained on.
# Using the SAME random_state as training (2026, from build_realistic_hard_dataset.py)
# reproduces the exact same test split the model was evaluated on during training.
_, X_test, _, y_test = train_test_split(X, y, test_size=0.2, random_state=2026, stratify=y)

print(f"Testing on {len(X_test)} held-out accounts (never seen during training)...")
y_pred = model.predict(X_test)

print("\n" + "=" * 40)
print("MODEL ACCURACY REPORT (Held-Out Test Set)")
print("=" * 40)
accuracy = accuracy_score(y_test, y_pred)
print(f"Overall Accuracy: {accuracy * 100:.2f}%\n")

cm = confusion_matrix(y_test, y_pred)
print("CONFUSION MATRIX:")
print(f"True Negatives  (Safe correctly cleared):   {cm[0][0]}")
print(f"False Positives (Safe wrongly flagged):     {cm[0][1]}")
print(f"False Negatives (Mules missed):              {cm[1][0]}")
print(f"True Positives  (Mules correctly caught):    {cm[1][1]}\n")

print("CLASSIFICATION REPORT:")
print(classification_report(y_test, y_pred, target_names=['Safe', 'Mule']))