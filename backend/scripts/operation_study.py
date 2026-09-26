"""Run bounded synthetic sensitivity study and persist auditable artifacts."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.operation_demo.models import DemoConfig
from app.operation_demo.study import run_study

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    parser.add_argument('--seeds',type=int,default=30)
    parser.add_argument('--days',type=int,default=2)
    args=parser.parse_args()
    result=run_study(DemoConfig(days=args.days),args.seeds)
    output=Path(args.output)
    output.mkdir(parents=True,exist_ok=True)
    path=output/'study.json'
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    lines=['# Estudo sintético CurtailIQ','',*['- '+s for s in result['warnings']], '',
           '## Estatísticas do horizonte', '```json',json.dumps(result['statistics'],indent=2),'```',
           '', '## Sensibilidades', '```json',json.dumps(result['sensitivities'],ensure_ascii=False,indent=2),'```',
           '', 'SHA256 study.json: '+hashlib.sha256(path.read_bytes()).hexdigest()]
    (output/'study.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps(result['statistics'],indent=2))
