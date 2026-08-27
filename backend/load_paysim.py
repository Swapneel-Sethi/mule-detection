import kagglehub
from kagglehub import KaggleDatasetAdapter

df = kagglehub.dataset_load(
    KaggleDatasetAdapter.PANDAS,
    'ealaxi/paysim1',
    'PS_20174392719_1491204439457_log.csv',
    pandas_kwargs={
        'encoding': 'latin1',
        'engine': 'python',      # more forgiving than the default C parser
        'on_bad_lines': 'skip',  # skip any genuinely malformed rows instead of crashing
    },
)

print('Shape:', df.shape)
print(df.head())

df.to_csv('paysim_raw.csv', index=False)
print('Saved as paysim_raw.csv')