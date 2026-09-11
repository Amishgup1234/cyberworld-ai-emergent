"""
CyberWorld AI — Predictive Cybersecurity Platform · Backend

FastAPI + MongoDB service that powers the digital twin dashboard:
  · Multi-scenario predictive replays (attack progression across frames)
  · Server-computed frame state, kill-chain probabilities, MITRE mapping
  · What-if defense simulation (mitigation delta computation)
  · Incident bundle save/export for SOC handoff
  · Multi-tenant (MSSP) support
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

# --------------------------------------------------------------------------
# Environment / Database
# --------------------------------------------------------------------------
load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _oid_to_str(v: Any) -> str:
    return str(v) if v is not None else v

PyObjectId = Annotated[str, BeforeValidator(_oid_to_str)]


def _serialize(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return doc
    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    return out


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------
# Seed data — 3 attack scenarios inspired by the CyberWorld AI PDF
# --------------------------------------------------------------------------
def _stage(name: str, activate: int, target: float, color: str) -> dict:
    return {"stage": name, "activate_at": activate, "target": target, "color": color}


SCENARIOS_SEED = [
    {
        "id": "sc-ransom-ω-7742",
        "name": "Ransomware Ω-7742",
        "summary": "Credential-driven lateral movement toward the PII crown jewel.",
        "family": "Ransomware · Lateral Movement",
        "seed": 42,
        "frame_count": 30,
        "nodes": [
            {"id":"gw-01","label":"Perimeter Gateway","kind":"gateway","x":90,"y":220,"base":"safe","escalate_at":4,"peak":"watch","ip":"10.0.0.1","tier":"Perimeter"},
            {"id":"fw-01","label":"Next-Gen Firewall","kind":"gateway","x":200,"y":130,"base":"safe","ip":"10.0.0.2","tier":"Perimeter"},
            {"id":"vpn-01","label":"VPN Concentrator","kind":"gateway","x":200,"y":320,"base":"safe","escalate_at":6,"peak":"warn","ip":"10.0.0.9","tier":"Perimeter"},
            {"id":"ad-01","label":"AD-01 Domain Ctrl","kind":"identity","x":380,"y":220,"base":"safe","escalate_at":10,"peak":"critical","ip":"10.0.10.4","tier":"Core Identity"},
            {"id":"db-01","label":"PII Database","kind":"db","x":560,"y":130,"base":"safe","escalate_at":16,"peak":"critical","ip":"10.0.20.12","tier":"Crown Jewels"},
            {"id":"db-02","label":"Finance Vault","kind":"db","x":560,"y":310,"base":"safe","escalate_at":18,"peak":"warn","ip":"10.0.20.14","tier":"Crown Jewels"},
            {"id":"srv-01","label":"File Server SMB","kind":"server","x":380,"y":380,"base":"safe","escalate_at":12,"peak":"warn","ip":"10.0.30.5","tier":"Core"},
            {"id":"srv-02","label":"Mail Exchange","kind":"server","x":380,"y":60,"base":"safe","escalate_at":5,"peak":"watch","ip":"10.0.30.7","tier":"Core"},
            {"id":"cld-01","label":"S3 Backup Bucket","kind":"cloud","x":720,"y":100,"base":"safe","escalate_at":22,"peak":"watch","ip":"aws-us-1","tier":"Cloud"},
            {"id":"cld-02","label":"K8s Prod Cluster","kind":"cloud","x":720,"y":260,"base":"safe","ip":"k8s-prod","tier":"Cloud"},
            {"id":"ws-01","label":"HR-Laptop-014","kind":"workstation","x":190,"y":460,"base":"safe","ip":"10.0.40.14","tier":"Workstation"},
            {"id":"ws-02","label":"Dev-Workstation-22","kind":"workstation","x":560,"y":460,"base":"safe","escalate_at":14,"peak":"warn","ip":"10.0.40.22","tier":"Workstation"},
            {"id":"iot-01","label":"HVAC Controller","kind":"iot","x":720,"y":420,"base":"safe","escalate_at":4,"peak":"watch","ip":"10.0.90.3","tier":"OT/IoT"},
        ],
        "edges": [
            {"from":"gw-01","to":"fw-01","intensity":0.9},
            {"from":"gw-01","to":"vpn-01","intensity":0.6},
            {"from":"fw-01","to":"ad-01","intensity":0.8},
            {"from":"vpn-01","to":"ad-01","intensity":0.7,"malicious":True,"appears_at":6},
            {"from":"ad-01","to":"db-01","intensity":0.9,"predicted":True,"malicious":True,"appears_at":16},
            {"from":"ad-01","to":"db-02","intensity":0.5},
            {"from":"ad-01","to":"srv-01","intensity":0.75,"malicious":True,"appears_at":10},
            {"from":"srv-02","to":"fw-01","intensity":0.4},
            {"from":"srv-01","to":"ws-02","intensity":0.55,"predicted":True,"appears_at":14},
            {"from":"db-01","to":"cld-01","intensity":0.7,"predicted":True,"appears_at":22},
            {"from":"cld-02","to":"db-02","intensity":0.35},
            {"from":"ws-01","to":"vpn-01","intensity":0.5},
            {"from":"iot-01","to":"cld-02","intensity":0.3},
        ],
        "stages": [
            _stage("Recon", 0, 0.98, "#00F0FF"),
            _stage("Initial Access", 3, 0.92, "#00F0FF"),
            _stage("Execution", 6, 0.87, "#7C6BFF"),
            _stage("Persistence", 10, 0.72, "#7C6BFF"),
            _stage("Priv Escalation", 14, 0.61, "#FFAA00"),
            _stage("Lateral Movement", 18, 0.44, "#FFAA00"),
            _stage("Credential Access", 22, 0.29, "#FF2E63"),
            _stage("Exfiltration", 26, 0.11, "#FF2E63"),
        ],
        "mitre": [
            {"tactic":"Recon","techniques":[{"id":"T1595","name":"Active Scanning","conf":0.97,"active_at":0},{"id":"T1592","name":"Victim Host Info","conf":0.71,"active_at":1}]},
            {"tactic":"Initial Access","techniques":[{"id":"T1078","name":"Valid Accounts","conf":0.94,"active_at":3},{"id":"T1566","name":"Phishing","conf":0.55,"active_at":4}]},
            {"tactic":"Execution","techniques":[{"id":"T1059","name":"Command & Scripting","conf":0.88,"active_at":6}]},
            {"tactic":"Persistence","techniques":[{"id":"T1136","name":"Create Account","conf":0.66,"active_at":10},{"id":"T1053","name":"Scheduled Task","conf":0.42,"active_at":11}]},
            {"tactic":"Priv Escalation","techniques":[{"id":"T1068","name":"Exploit Vuln (CVE-2026-1189)","conf":0.61,"active_at":14}]},
            {"tactic":"Credential Access","techniques":[{"id":"T1558","name":"Kerberoasting","conf":0.58,"active_at":22},{"id":"T1003","name":"OS Credential Dumping","conf":0.31,"active_at":23}]},
            {"tactic":"Lateral Movement","techniques":[{"id":"T1021","name":"Remote Services (SMB)","conf":0.47,"active_at":18}]},
            {"tactic":"Exfiltration","techniques":[{"id":"T1041","name":"C2 Channel Exfil","conf":0.12,"active_at":26}]},
        ],
        "xai": [
            {"name":"SMB traffic anomaly (srv-01)","weight":0.34,"dir":"up","context":"Volume 6.4× baseline for last 480s","active_at":10},
            {"name":"Kerberos service ticket bursts (ad-01)","weight":0.28,"dir":"up","context":"11 SPN requests / 60s window","active_at":12},
            {"name":"VPN session from novel ASN","weight":0.17,"dir":"up","context":"AS205100 first-seen in 90d window","active_at":6},
            {"name":"Dormant service account activated","weight":0.11,"dir":"up","context":"svc_backup_legacy — no auth in 214d","active_at":14},
            {"name":"Reduced beaconing entropy (out-01)","weight":0.07,"dir":"down","context":"Model expects broader jitter","active_at":4},
            {"name":"CVE-2026-1189 patch missing","weight":0.03,"dir":"up","context":"Endpoint SCCM confirms unpatched","active_at":14},
        ],
        "mitigations": [
            {"id":"isolate-ad-01","label":"Isolate AD-01 domain controller","delta":-47,"icon":"ShieldOff"},
            {"id":"block-smb","label":"Block SMB (port 445) at core switch","delta":-22,"icon":"Ban"},
            {"id":"mfa-vpn","label":"Enforce MFA re-auth on VPN sessions","delta":-9,"icon":"Lock"},
            {"id":"patch-cve","label":"Apply patch CVE-2026-1189","delta":-18,"icon":"Binary"},
            {"id":"kill-svc-account","label":"Disable svc_backup_legacy account","delta":-6,"icon":"Fingerprint"},
        ],
        "target_pool": [
            {"host":"db-01 (PII Database)","peak":0.78,"activate_at":16,"eta_base":22,"color":"#FF2E63"},
            {"host":"srv-01 (SMB Fileserver)","peak":0.61,"activate_at":10,"eta_base":14,"color":"#FFAA00"},
            {"host":"cld-01 (S3 Backup)","peak":0.34,"activate_at":22,"eta_base":38,"color":"#7C6BFF"},
        ],
        "log_seed": [
            {"at":0,"tag":"MODEL","color":"cyan","text":"Temporal model checkpoint tw-v3.4.1 loaded (80 features)"},
            {"at":1,"tag":"PREDICT","color":"lime","text":"Twin sync 12,480 nodes · 42,110 edges committed"},
            {"at":3,"tag":"ANOMALY","color":"amber","text":"Novel ASN AS205100 first-seen on vpn-01 tunnel"},
            {"at":5,"tag":"MITRE","color":"violet","text":"T1078 Valid Accounts observed on vpn-01"},
            {"at":6,"tag":"FORECAST","color":"cyan","text":"Path prob vpn-01 -> ad-01 = 0.42 (rising)"},
            {"at":8,"tag":"ANOMALY","color":"amber","text":"Kerberos SPN request burst on ad-01 (11/60s)"},
            {"at":10,"tag":"MITRE","color":"violet","text":"T1059 Command & Scripting matched on ad-01"},
            {"at":11,"tag":"ANOMALY","color":"amber","text":"SMB burst detected srv-01 <- ad-01 (6.4x baseline)"},
            {"at":12,"tag":"FORECAST","color":"cyan","text":"Attack path predicted ad-01 -> srv-01 -> db-01 (p=0.61)"},
            {"at":14,"tag":"DEFEND","color":"lime","text":"Recommendation: isolate ad-01 (est. delta -47%)"},
            {"at":15,"tag":"ANOMALY","color":"amber","text":"svc_backup_legacy activated after 214d dormant window"},
            {"at":16,"tag":"CRITICAL","color":"rose","text":"db-01 (Crown Jewel) elevated to CRITICAL — lead 6 min"},
            {"at":18,"tag":"ATTACK","color":"rose","text":"Lateral pivot ad-01 -> srv-01 -> ws-02 confirmed"},
            {"at":20,"tag":"MITRE","color":"violet","text":"T1021 Remote Services (SMB) mapped conf=0.47"},
            {"at":22,"tag":"MITRE","color":"violet","text":"T1558 Kerberoasting mapped conf=0.58 on ad-01"},
            {"at":24,"tag":"CRITICAL","color":"rose","text":"Predicted exfil path db-01 -> cld-01 (S3) p=0.34"},
            {"at":26,"tag":"ATTACK","color":"rose","text":"C2 beaconing signature match on outbound cld-01"},
            {"at":28,"tag":"DEFEND","color":"lime","text":"Auto-suggested playbook: isolate + patch + block-445"},
        ],
    },
    {
        "id": "sc-cloud-γ-3311",
        "name": "Cloud Credential Heist γ-3311",
        "summary": "Novel-region IAM abuse pivoting from a compromised VPN into cloud storage.",
        "family": "Cloud IAM · Data Exfiltration",
        "seed": 42,
        "frame_count": 30,
        "nodes": [
            {"id":"gw-01","label":"Edge Gateway","kind":"gateway","x":90,"y":230,"base":"safe","ip":"10.0.0.1","tier":"Perimeter"},
            {"id":"vpn-01","label":"SSL VPN","kind":"gateway","x":230,"y":320,"base":"safe","escalate_at":2,"peak":"warn","ip":"10.0.0.9","tier":"Perimeter"},
            {"id":"idp-01","label":"IAM Provider","kind":"identity","x":230,"y":130,"base":"safe","escalate_at":8,"peak":"critical","ip":"iam.core","tier":"Core Identity"},
            {"id":"api-01","label":"API Gateway","kind":"server","x":420,"y":220,"base":"safe","escalate_at":10,"peak":"warn","ip":"10.0.10.20","tier":"Core"},
            {"id":"cld-01","label":"S3 Data Lake","kind":"cloud","x":620,"y":120,"base":"safe","escalate_at":16,"peak":"critical","ip":"s3-lake-ue1","tier":"Crown Jewels"},
            {"id":"cld-02","label":"BigQuery Warehouse","kind":"cloud","x":620,"y":320,"base":"safe","escalate_at":22,"peak":"warn","ip":"bq-prod","tier":"Crown Jewels"},
            {"id":"cld-03","label":"K8s Cluster","kind":"cloud","x":420,"y":440,"base":"safe","ip":"k8s-prod","tier":"Cloud"},
            {"id":"cld-04","label":"CDN Edge","kind":"cloud","x":780,"y":220,"base":"safe","escalate_at":26,"peak":"watch","ip":"cf-edge","tier":"Cloud"},
            {"id":"ws-01","label":"Contractor Laptop","kind":"workstation","x":90,"y":420,"base":"safe","escalate_at":0,"peak":"watch","ip":"10.0.40.55","tier":"Workstation"},
        ],
        "edges": [
            {"from":"ws-01","to":"vpn-01","intensity":0.6,"malicious":True,"appears_at":2},
            {"from":"vpn-01","to":"idp-01","intensity":0.8,"malicious":True,"appears_at":6},
            {"from":"idp-01","to":"api-01","intensity":0.9,"predicted":True,"malicious":True,"appears_at":10},
            {"from":"api-01","to":"cld-01","intensity":0.85,"predicted":True,"malicious":True,"appears_at":16},
            {"from":"api-01","to":"cld-02","intensity":0.5,"predicted":True,"appears_at":22},
            {"from":"cld-01","to":"cld-04","intensity":0.7,"predicted":True,"appears_at":26},
            {"from":"api-01","to":"cld-03","intensity":0.4},
            {"from":"gw-01","to":"vpn-01","intensity":0.9},
        ],
        "stages": [
            _stage("Recon", 0, 0.94, "#00F0FF"),
            _stage("Initial Access", 2, 0.88, "#00F0FF"),
            _stage("Execution", 4, 0.79, "#7C6BFF"),
            _stage("Persistence", 8, 0.68, "#7C6BFF"),
            _stage("Priv Escalation", 10, 0.72, "#FFAA00"),
            _stage("Lateral Movement", 14, 0.55, "#FFAA00"),
            _stage("Credential Access", 18, 0.41, "#FF2E63"),
            _stage("Exfiltration", 24, 0.28, "#FF2E63"),
        ],
        "mitre": [
            {"tactic":"Recon","techniques":[{"id":"T1595","name":"Active Scanning","conf":0.93,"active_at":0}]},
            {"tactic":"Initial Access","techniques":[{"id":"T1078.004","name":"Valid Cloud Accounts","conf":0.90,"active_at":2}]},
            {"tactic":"Execution","techniques":[{"id":"T1059","name":"Command & Scripting","conf":0.76,"active_at":4}]},
            {"tactic":"Persistence","techniques":[{"id":"T1098","name":"Account Manipulation","conf":0.68,"active_at":8}]},
            {"tactic":"Priv Escalation","techniques":[{"id":"T1548","name":"Abuse Elevation Control","conf":0.72,"active_at":10}]},
            {"tactic":"Credential Access","techniques":[{"id":"T1552","name":"Unsecured Credentials","conf":0.55,"active_at":14},{"id":"T1528","name":"Steal App Access Token","conf":0.41,"active_at":18}]},
            {"tactic":"Lateral Movement","techniques":[{"id":"T1550","name":"Use Alternate Auth","conf":0.55,"active_at":14}]},
            {"tactic":"Exfiltration","techniques":[{"id":"T1567","name":"Exfil to Cloud Storage","conf":0.28,"active_at":24}]},
        ],
        "xai": [
            {"name":"IAM AssumeRole from novel region","weight":0.36,"dir":"up","context":"eu-north-1 first-seen for user","active_at":6},
            {"name":"API burst on GetObject","weight":0.24,"dir":"up","context":"14× normal ListBucket rate","active_at":10},
            {"name":"MFA disabled on service account","weight":0.18,"dir":"up","context":"config drift last 2h","active_at":8},
            {"name":"Novel egress destination","weight":0.14,"dir":"up","context":"S3 → CF edge asn AS16509","active_at":20},
            {"name":"Peer traffic dropped","weight":0.05,"dir":"down","context":"expected internal fanout absent","active_at":4},
            {"name":"Bucket policy change","weight":0.03,"dir":"up","context":"PutBucketPolicy on lake","active_at":22},
        ],
        "mitigations": [
            {"id":"revoke-tokens","label":"Revoke all IAM sessions for compromised principal","delta":-52,"icon":"ShieldOff"},
            {"id":"rotate-keys","label":"Rotate API keys and service credentials","delta":-24,"icon":"Fingerprint"},
            {"id":"restrict-egress","label":"Block egress to novel ASN AS16509","delta":-14,"icon":"Ban"},
            {"id":"enforce-mfa","label":"Enforce MFA on all cloud identities","delta":-10,"icon":"Lock"},
            {"id":"disable-bucket-public","label":"Disable public access on s3-lake","delta":-8,"icon":"Binary"},
        ],
        "target_pool": [
            {"host":"cld-01 (S3 Data Lake)","peak":0.82,"activate_at":16,"eta_base":18,"color":"#FF2E63"},
            {"host":"cld-02 (BigQuery)","peak":0.44,"activate_at":22,"eta_base":30,"color":"#FFAA00"},
            {"host":"cld-04 (CDN Edge)","peak":0.28,"activate_at":26,"eta_base":42,"color":"#7C6BFF"},
        ],
        "log_seed": [
            {"at":0,"tag":"MODEL","color":"cyan","text":"Loading twin snapshot for tenant · cloud graph 3,220 objects"},
            {"at":2,"tag":"ANOMALY","color":"amber","text":"IAM AssumeRole from eu-north-1 for user@contractor"},
            {"at":4,"tag":"MITRE","color":"violet","text":"T1078.004 Valid Cloud Accounts observed"},
            {"at":8,"tag":"ANOMALY","color":"amber","text":"MFA suddenly disabled for svc-etl role"},
            {"at":10,"tag":"FORECAST","color":"cyan","text":"Path prob idp-01 -> api-01 -> cld-01 = 0.62 (rising)"},
            {"at":12,"tag":"ANOMALY","color":"amber","text":"GetObject burst 14× baseline on s3-lake"},
            {"at":16,"tag":"CRITICAL","color":"rose","text":"cld-01 (Crown Jewel) elevated to CRITICAL — lead 2 min"},
            {"at":20,"tag":"ATTACK","color":"rose","text":"Data staged for exfil to CF edge AS16509"},
            {"at":22,"tag":"MITRE","color":"violet","text":"T1552 Unsecured Credentials matched (config drift)"},
            {"at":24,"tag":"ATTACK","color":"rose","text":"Exfil in progress — 2.4 GB transferred so far"},
            {"at":26,"tag":"DEFEND","color":"lime","text":"Auto-suggested: revoke IAM + block egress + rotate keys"},
        ],
    },
    {
        "id": "sc-supply-λ-9018",
        "name": "Supply Chain Compromise λ-9018",
        "summary": "Poisoned CI/CD artefact propagates to production Kubernetes.",
        "family": "Supply Chain · CI/CD",
        "seed": 42,
        "frame_count": 30,
        "nodes": [
            {"id":"ws-01","label":"Dev Laptop 007","kind":"workstation","x":90,"y":220,"base":"safe","escalate_at":2,"peak":"warn","ip":"10.0.40.7","tier":"Workstation"},
            {"id":"repo-01","label":"Git Server","kind":"server","x":250,"y":120,"base":"safe","escalate_at":6,"peak":"warn","ip":"git.core","tier":"Core"},
            {"id":"ci-01","label":"CI Runner Farm","kind":"server","x":250,"y":320,"base":"safe","escalate_at":10,"peak":"critical","ip":"ci.pool","tier":"Core"},
            {"id":"reg-01","label":"Container Registry","kind":"db","x":430,"y":220,"base":"safe","escalate_at":14,"peak":"critical","ip":"reg.core","tier":"Crown Jewels"},
            {"id":"k8s-01","label":"Prod K8s Cluster","kind":"cloud","x":620,"y":120,"base":"safe","escalate_at":20,"peak":"critical","ip":"k8s-prod","tier":"Crown Jewels"},
            {"id":"k8s-02","label":"Staging Cluster","kind":"cloud","x":620,"y":320,"base":"safe","escalate_at":16,"peak":"warn","ip":"k8s-stg","tier":"Cloud"},
            {"id":"db-01","label":"App Database","kind":"db","x":790,"y":220,"base":"safe","escalate_at":24,"peak":"warn","ip":"pg-prod","tier":"Crown Jewels"},
            {"id":"secrets","label":"Secrets Vault","kind":"identity","x":430,"y":420,"base":"safe","escalate_at":18,"peak":"warn","ip":"vault","tier":"Core Identity"},
        ],
        "edges": [
            {"from":"ws-01","to":"repo-01","intensity":0.8,"malicious":True,"appears_at":4},
            {"from":"repo-01","to":"ci-01","intensity":0.9,"malicious":True,"appears_at":8},
            {"from":"ci-01","to":"reg-01","intensity":0.9,"malicious":True,"predicted":True,"appears_at":12},
            {"from":"reg-01","to":"k8s-02","intensity":0.7,"predicted":True,"appears_at":16},
            {"from":"reg-01","to":"k8s-01","intensity":0.9,"predicted":True,"malicious":True,"appears_at":20},
            {"from":"k8s-01","to":"db-01","intensity":0.7,"predicted":True,"appears_at":24},
            {"from":"ci-01","to":"secrets","intensity":0.5,"predicted":True,"appears_at":18},
        ],
        "stages": [
            _stage("Recon", 0, 0.91, "#00F0FF"),
            _stage("Initial Access", 2, 0.85, "#00F0FF"),
            _stage("Execution", 6, 0.78, "#7C6BFF"),
            _stage("Persistence", 10, 0.74, "#7C6BFF"),
            _stage("Priv Escalation", 14, 0.66, "#FFAA00"),
            _stage("Lateral Movement", 18, 0.52, "#FFAA00"),
            _stage("Credential Access", 22, 0.34, "#FF2E63"),
            _stage("Exfiltration", 26, 0.19, "#FF2E63"),
        ],
        "mitre": [
            {"tactic":"Recon","techniques":[{"id":"T1596","name":"Search Open Sources","conf":0.90,"active_at":0}]},
            {"tactic":"Initial Access","techniques":[{"id":"T1195","name":"Supply Chain Compromise","conf":0.85,"active_at":2}]},
            {"tactic":"Execution","techniques":[{"id":"T1204","name":"User Execution (CI pipeline)","conf":0.78,"active_at":6}]},
            {"tactic":"Persistence","techniques":[{"id":"T1554","name":"Compromise Client Software Binary","conf":0.74,"active_at":10}]},
            {"tactic":"Priv Escalation","techniques":[{"id":"T1611","name":"Escape to Host (container)","conf":0.66,"active_at":14}]},
            {"tactic":"Credential Access","techniques":[{"id":"T1552.007","name":"Container API Creds","conf":0.34,"active_at":22}]},
            {"tactic":"Lateral Movement","techniques":[{"id":"T1610","name":"Deploy Container","conf":0.52,"active_at":18}]},
            {"tactic":"Exfiltration","techniques":[{"id":"T1041","name":"C2 Exfiltration","conf":0.19,"active_at":26}]},
        ],
        "xai": [
            {"name":"Unsigned commit into main","weight":0.32,"dir":"up","context":"first ever unsigned push by user","active_at":4},
            {"name":"CI job spawns outbound shell","weight":0.28,"dir":"up","context":"never observed in prior 4,200 runs","active_at":8},
            {"name":"New image layer > 800MB","weight":0.16,"dir":"up","context":"anomalous vs mean 41MB","active_at":12},
            {"name":"K8s ServiceAccount created at runtime","weight":0.13,"dir":"up","context":"runtime creation is rare","active_at":18},
            {"name":"Registry pulls from staging namespace","weight":0.08,"dir":"up","context":"staging→prod pull is novel","active_at":16},
            {"name":"Reduced test coverage in pipeline","weight":0.03,"dir":"down","context":"unusual for main branch","active_at":6},
        ],
        "mitigations": [
            {"id":"quarantine-image","label":"Quarantine registry image sha:...c8f2","delta":-55,"icon":"ShieldOff"},
            {"id":"revoke-ci-tokens","label":"Rotate CI runner tokens","delta":-20,"icon":"Fingerprint"},
            {"id":"block-registry-pull","label":"Block prod cluster pulls from registry","delta":-14,"icon":"Ban"},
            {"id":"sbom-freeze","label":"Freeze deploy pipeline pending SBOM audit","delta":-9,"icon":"Binary"},
            {"id":"revoke-secrets","label":"Rotate all vault secrets touched by CI","delta":-7,"icon":"Lock"},
        ],
        "target_pool": [
            {"host":"k8s-01 (Prod Cluster)","peak":0.86,"activate_at":20,"eta_base":24,"color":"#FF2E63"},
            {"host":"reg-01 (Registry)","peak":0.72,"activate_at":14,"eta_base":16,"color":"#FFAA00"},
            {"host":"db-01 (App DB)","peak":0.39,"activate_at":24,"eta_base":36,"color":"#7C6BFF"},
        ],
        "log_seed": [
            {"at":0,"tag":"MODEL","color":"cyan","text":"Loading supply chain twin · 4,821 CI jobs indexed"},
            {"at":2,"tag":"ANOMALY","color":"amber","text":"Unsigned push into main by dev-007"},
            {"at":6,"tag":"MITRE","color":"violet","text":"T1195 Supply Chain Compromise matched"},
            {"at":8,"tag":"ANOMALY","color":"amber","text":"CI job spawned outbound reverse shell"},
            {"at":10,"tag":"FORECAST","color":"cyan","text":"Path prob ci-01 -> reg-01 -> k8s-01 = 0.66"},
            {"at":12,"tag":"ANOMALY","color":"amber","text":"New image layer 840MB pushed sha:...c8f2"},
            {"at":14,"tag":"CRITICAL","color":"rose","text":"reg-01 (Crown Jewel) elevated to CRITICAL"},
            {"at":18,"tag":"MITRE","color":"violet","text":"T1610 Deploy Container matched in staging"},
            {"at":20,"tag":"ATTACK","color":"rose","text":"Prod cluster pulling compromised image sha:...c8f2"},
            {"at":24,"tag":"CRITICAL","color":"rose","text":"Predicted exfil path k8s-01 -> db-01 (p=0.39)"},
            {"at":26,"tag":"DEFEND","color":"lime","text":"Auto-suggested: quarantine image + freeze pipeline"},
        ],
    },
]

TENANTS_SEED = [
    {"id": "ten-acme",     "name": "ACME Financial Group",   "region": "US-EAST-1",  "operator": "A. Kowalski",  "tier": "Enterprise"},
    {"id": "ten-orbital",  "name": "Orbital Health Systems", "region": "EU-WEST-2",  "operator": "M. Osei",      "tier": "Enterprise"},
    {"id": "ten-fortis",   "name": "Fortis MSSP · Client 14","region": "AP-SOUTH-1", "operator": "S. Tanaka",    "tier": "MSSP"},
]


# --------------------------------------------------------------------------
# Compute helpers (frame-derived state)
# --------------------------------------------------------------------------
def stage_prob(activate_at: int, target: float, frame: int) -> float:
    if frame < activate_at:
        return 0.0
    ramp = min(1.0, (frame - activate_at) / 4.0)
    return round(target * ramp, 4)


def risk_at(node: dict, frame: int) -> str:
    ladder = ["safe", "watch", "warn", "critical"]
    base = node.get("base", "safe")
    if "escalate_at" not in node or "peak" not in node:
        return base
    esc = int(node["escalate_at"])
    peak = str(node["peak"])
    if frame < esc:
        return base
    if frame < esc + 4:
        return ladder[min(ladder.index(peak), ladder.index(base) + 1)]
    if frame < esc + 8:
        return ladder[max(0, ladder.index(peak) - 1)]
    return peak


def compute_frame(scenario: dict, frame: int) -> dict[str, Any]:
    total_frames = int(scenario.get("frame_count", 30))
    frame = max(0, min(total_frames - 1, frame))

    stages_out = []
    stages_done = 0
    for s in scenario["stages"]:
        prob = stage_prob(int(s["activate_at"]), float(s["target"]), frame)
        done = frame > int(s["activate_at"]) + 4
        if done:
            stages_done += 1
        stages_out.append({
            "stage": s["stage"], "color": s["color"], "activate_at": s["activate_at"],
            "target": s["target"], "prob": prob, "done": done,
        })

    nodes_out = [{**n, "risk": risk_at(n, frame)} for n in scenario["nodes"]]

    edges_out = [
        {**e, "visible": (e.get("appears_at", -1) <= frame)}
        for e in scenario["edges"]
    ]

    mitre_out = []
    for col in scenario["mitre"]:
        techs = []
        for t in col["techniques"]:
            active = frame >= int(t["active_at"])
            techs.append({**t, "active": active, "current_conf": t["conf"] if active else 0.0})
        mitre_out.append({"tactic": col["tactic"], "techniques": techs})

    xai_out = [{**s, "active": frame >= int(s["active_at"])} for s in scenario["xai"]]

    targets_out = []
    for t in scenario["target_pool"]:
        pct = stage_prob(int(t["activate_at"]), float(t["peak"]), frame)
        eta = max(0, int(t["eta_base"]) - frame)
        targets_out.append({"host": t["host"], "pct": pct, "eta_min": eta, "color": t["color"]})

    lead = max(0, (22 - frame)) * 60
    conf = round(min(99.9, 90 + frame * 0.3), 2)

    critical_count = sum(1 for n in nodes_out if n["risk"] == "critical")
    warn_count = sum(1 for n in nodes_out if n["risk"] == "warn")
    active_threat_vectors = min(3, frame // 8)

    log_lines = [
        {"t": f"{l['at'] * 0.12:.3f}", **{k: v for k, v in l.items()}}
        for l in scenario["log_seed"] if l["at"] <= frame
    ]

    return {
        "frame": frame,
        "frame_count": total_frames,
        "stages": stages_out,
        "stages_done": stages_done,
        "nodes": nodes_out,
        "edges": edges_out,
        "mitre": mitre_out,
        "xai": xai_out,
        "targets": targets_out,
        "logs": log_lines,
        "kpis": {
            "active_threat_vectors": active_threat_vectors,
            "forecast_confidence": conf,
            "lead_time_sec": lead,
            "twin_nodes": 12480,
            "twin_edges": 42110,
            "critical_nodes": critical_count,
            "warn_nodes": warn_count,
            "twin_fidelity": 99.4,
        },
        "computed_at": now_iso(),
    }


def compute_baseline_and_mitigated(scenario: dict, frame: int, mitigation_ids: list[str]) -> dict:
    baseline = 0.0
    for t in scenario["target_pool"]:
        p = stage_prob(int(t["activate_at"]), float(t["peak"]), frame)
        if p > baseline:
            baseline = p
    delta_pct = 0
    picked = []
    for m in scenario["mitigations"]:
        if m["id"] in mitigation_ids:
            delta_pct += int(m["delta"])
            picked.append(m)
    new_risk = max(0.02, baseline + delta_pct / 100.0)
    return {
        "frame": frame,
        "baseline_risk": round(baseline, 4),
        "delta_pct": delta_pct,
        "new_risk": round(new_risk, 4),
        "applied": picked,
    }


# --------------------------------------------------------------------------
# Pydantic request models
# --------------------------------------------------------------------------
class SimulateReq(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scenario_id: str
    frame: int = Field(0, ge=0, le=29)
    mitigation_ids: list[str] = Field(default_factory=list)


class IncidentReq(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scenario_id: str
    tenant_id: str | None = None
    frame: int
    title: str
    operator: str | None = None
    notes: str | None = None
    mitigation_ids: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# FastAPI app
# --------------------------------------------------------------------------
app = FastAPI(title="CyberWorld AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def seed_and_index() -> None:
    # Scenarios seed
    for sc in SCENARIOS_SEED:
        await db.scenarios.update_one({"id": sc["id"]}, {"$set": sc}, upsert=True)
    # Tenants seed
    for t in TENANTS_SEED:
        await db.tenants.update_one({"id": t["id"]}, {"$set": t}, upsert=True)
    # Indexes
    await db.incidents.create_index("id", unique=True)
    await db.incidents.create_index("created_at")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    scenario_count = await db.scenarios.count_documents({})
    return {
        "status": "ok",
        "service": "cyberworld-ai",
        "version": "1.0.0",
        "model": "tw-v3.4.1",
        "features": 80,
        "scenarios_loaded": scenario_count,
        "timestamp": now_iso(),
    }


@app.get("/api/tenants")
async def list_tenants() -> list[dict[str, Any]]:
    cur = db.tenants.find({}, {"_id": 0}).sort("name", 1)
    return [t async for t in cur]


@app.get("/api/scenarios")
async def list_scenarios() -> list[dict[str, Any]]:
    cur = db.scenarios.find({}, {"_id": 0, "id": 1, "name": 1, "summary": 1, "family": 1, "frame_count": 1}).sort("name", 1)
    return [s async for s in cur]


@app.get("/api/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str) -> dict[str, Any]:
    sc = await db.scenarios.find_one({"id": scenario_id}, {"_id": 0})
    if not sc:
        raise HTTPException(status_code=404, detail="scenario not found")
    return sc


@app.get("/api/scenarios/{scenario_id}/frame/{frame}")
async def get_frame(scenario_id: str, frame: int) -> dict[str, Any]:
    sc = await db.scenarios.find_one({"id": scenario_id}, {"_id": 0})
    if not sc:
        raise HTTPException(status_code=404, detail="scenario not found")
    return compute_frame(sc, frame)


@app.post("/api/simulate")
async def simulate(req: SimulateReq) -> dict[str, Any]:
    sc = await db.scenarios.find_one({"id": req.scenario_id}, {"_id": 0})
    if not sc:
        raise HTTPException(status_code=404, detail="scenario not found")
    return compute_baseline_and_mitigated(sc, req.frame, req.mitigation_ids)


@app.post("/api/incidents")
async def create_incident(req: IncidentReq) -> dict[str, Any]:
    sc = await db.scenarios.find_one({"id": req.scenario_id}, {"_id": 0})
    if not sc:
        raise HTTPException(status_code=404, detail="scenario not found")

    incident_id = f"inc-{uuid.uuid4().hex[:8]}"
    frame_state = compute_frame(sc, req.frame)
    sim = compute_baseline_and_mitigated(sc, req.frame, req.mitigation_ids)

    doc = {
        "id": incident_id,
        "scenario_id": req.scenario_id,
        "scenario_name": sc["name"],
        "tenant_id": req.tenant_id,
        "frame": req.frame,
        "title": req.title,
        "operator": req.operator,
        "notes": req.notes,
        "mitigation_ids": req.mitigation_ids,
        "created_at": now_iso(),
        "snapshot": {
            "kpis": frame_state["kpis"],
            "targets": frame_state["targets"],
            "stages": frame_state["stages"],
            "mitre_active": [
                {"tactic": col["tactic"], "id": t["id"], "name": t["name"], "conf": t["current_conf"]}
                for col in frame_state["mitre"] for t in col["techniques"] if t["active"]
            ],
            "xai_active": [s for s in frame_state["xai"] if s["active"]],
            "simulation": sim,
        },
    }
    await db.incidents.insert_one(doc)
    return _serialize(doc)


@app.get("/api/incidents")
async def list_incidents(tenant_id: str | None = None) -> list[dict[str, Any]]:
    q: dict[str, Any] = {}
    if tenant_id:
        q["tenant_id"] = tenant_id
    cur = db.incidents.find(q, {"_id": 0}).sort("created_at", -1).limit(50)
    return [i async for i in cur]


@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str) -> dict[str, Any]:
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="incident not found")
    return doc
