import pandas as pd
import joblib

model = joblib.load('mule_xgboost_model.pkl')
df = pd.read_csv('ml_features_100k.csv')

X = df[model.get_booster().feature_names]
y = df['is_mule'].astype(int)

# Check correlation of each feature with the label
correlations = X.corrwith(y).sort_values(ascending=False)
print(correlations)