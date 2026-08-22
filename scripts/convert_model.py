import joblib, json, re, sys

model = joblib.load('mule_xgboost_model.pkl')
booster = model.get_booster() if hasattr(model, 'get_booster') else model
dumped = booster.get_dump()
feature_names = booster.feature_names

params = json.loads(booster.save_config())

try:
    lr = float(params['learner']['gradient_booster']['gbtree_param']['learning_rate'])
except Exception:
    lr = 0.1

try:
    base_margin = float(params['learner']['learner_model_param']['base_score'])
except Exception:
    base_margin = 0.0

try:
    obj_name = params['learner']['objective']['name']
except Exception:
    obj_name = 'binary:logistic'

print(f'Learning rate: {lr}')
print(f'Base score: {base_margin}')
print(f'Objective: {obj_name}')
print(f'Features: {feature_names}')
print(f'Num trees: {len(dumped)}')

def parse_tree_dump(dump_str, feature_names):
    lines = dump_str.strip().split('\n')
    nodes = {}

    for line in lines:
        line = line.rstrip()
        stripped = line.lstrip('\t')
        colon_idx = stripped.find(':')
        if colon_idx < 0:
            continue
        node_id = int(stripped[:colon_idx])
        rest = stripped[colon_idx + 1:]

        leaf_match = re.match(r'leaf=([-\d.e+]+)', rest)
        if leaf_match:
            nodes[node_id] = {'leaf': float(leaf_match.group(1))}
            continue

        bracket_match = re.match(
            r'\[(\w+)<([-\d.e+]+)\]\s*yes=(\d+),no=(\d+),missing=(\d+)', rest
        )
        if bracket_match:
            feat_name = bracket_match.group(1)
            threshold = float(bracket_match.group(2))
            yes_id = int(bracket_match.group(3))
            no_id = int(bracket_match.group(4))
            missing_id = int(bracket_match.group(5))
            nodes[node_id] = {
                'feature': feat_name,
                'threshold': threshold,
                'yes': yes_id,
                'no': no_id,
                'missing': missing_id,
            }

    def build_tree(node_id):
        if node_id not in nodes:
            return {'leaf': 0}
        n = nodes[node_id]
        if 'leaf' in n:
            return {'leaf': n['leaf']}
        return {
            'feature': n['feature'],
            'threshold': n['threshold'],
            'left': build_tree(n['yes']),
            'right': build_tree(n['no']),
            'missing': build_tree(n['missing']),
        }

    return build_tree(0)

trees = []
for dump in dumped:
    tree = parse_tree_dump(dump, feature_names)
    trees.append(tree)

valid = sum(1 for t in trees if 'leaf' not in t)
print(f'Trees with structure (not just leaf): {valid}/{len(trees)}')
r = trees[0]
print('Sample root keys:', list(r.keys()))
if 'left' in r:
    print('Root has children: left keys =', list(r['left'].keys()))

model_json = {
    'version': '1.0.0',
    'num_features': len(feature_names),
    'feature_names': feature_names,
    'num_trees': len(trees),
    'base_score': base_margin,
    'learning_rate': lr,
    'objective': obj_name,
    'trees': trees,
}

with open('public/model_weights.json', 'w') as f:
    json.dump(model_json, f)

file_size = len(json.dumps(model_json))
print(f'\nmodel_weights.json written: {file_size} bytes')
