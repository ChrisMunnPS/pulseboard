#!/bin/sh
# Pulseboard collector for Linux.
#
# READ-ONLY. It reads /proc, /sys and a few standard tools and prints one JSON document. It changes nothing.
# Install:   sudo install -m 0755 pulseboard-collect /usr/local/bin/pulseboard-collect
# Pulseboard runs it over SSH. The authorized_keys line it gives you locks the key to this one command.
# Pulseboard sends the word "metrics" or "inventory"; anything else is treated as "metrics".
#
# Optional (RAM modules and speed need root): let this one command run without a password, in /etc/sudoers.d/pulseboard:
#   <user> ALL=(root) NOPASSWD: /usr/sbin/dmidecode -t memory
PATH=/usr/sbin:/usr/bin:/sbin:/bin
MODE=${SSH_ORIGINAL_COMMAND:-metrics}
[ "$MODE" = inventory ] || MODE=metrics
T=$(mktemp -d 2>/dev/null) || exit 1
trap 'rm -rf "$T"' EXIT INT TERM

esc() { printf '%s' "$1" | tr '\t\r\n' '   ' | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
str() { if [ -n "$1" ]; then printf '"%s"' "$(esc "$1")"; else printf 'null'; fi; }
num() { case "$1" in ''|*[!0-9.]*) printf 'null';; *) printf '%s' "$1";; esac; }

HOST=$(hostname 2>/dev/null)
OSNAME=$( . /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-}" )
[ -n "$OSNAME" ] || OSNAME=$(uname -sr)
CPUMODEL=$(awk -F': *' '/^model name/{print $2; exit}' /proc/cpuinfo 2>/dev/null)

if [ "$MODE" = metrics ]; then
  snap() {
    grep '^cpu' /proc/stat > "$T/cpu$1"
    sed 's/:/ /' /proc/net/dev > "$T/net$1"
    cat /proc/[0-9]*/stat > "$T/proc$1" 2>/dev/null
    cut -d' ' -f1 /proc/uptime > "$T/up$1"
  }
  snap a; sleep 1; snap b
  DT=$(awk 'NR==FNR{a=$1;next}{d=$1-a; if(d<0.1)d=1; printf "%.2f", d}' "$T/upa" "$T/upb")
  CLK=$(getconf CLK_TCK 2>/dev/null || echo 100)
  PAGE=$(getconf PAGESIZE 2>/dev/null || echo 4096)

  # CPU: total and per core, from two samples one second apart
  R=$(awk 'NR==FNR{for(i=2;i<=NF;i++)p[$1,i]=$i;next}{t=0;id=0;for(i=2;i<=9&&i<=NF;i++){d=$i-p[$1,i];t+=d;if(i==5||i==6)id+=d}b=(t>0)?(t-id)*100/t:0;if($1=="cpu")tot=b;else c=c (c==""?"":",") sprintf("%.1f",b)}END{printf "%.1f|%s",tot,c}' "$T/cpua" "$T/cpub")
  LOAD=${R%%|*}; CORES=${R#*|}

  MEM=$(awk '/^MemTotal/{t=$2*1024}/^MemAvailable/{a=$2*1024}END{printf "%.0f %.0f",t,t-a}' /proc/meminfo)
  MT=${MEM% *}; MU=${MEM#* }
  UP=$(cut -d. -f1 "$T/upb")

  # Real filesystems only; the same filesystem mounted several times is listed once (shortest path)
  VOLS=$(df -P -T -B1 2>/dev/null | awk '
    function e(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);gsub(/[\001-\037]/,"",s);return s}
    NR>1 && $2 ~ /^(ext[234]|xfs|btrfs|zfs|vfat|f2fs|ntfs3?|exfat|fuseblk|nfs4?|cifs)$/ {
      m=$7; for(i=8;i<=NF;i++)m=m " " $i
      k=$3 ":" $4
      if(!(k in mnt) || length(m)<length(mnt[k])){mnt[k]=m;fs[k]=$2;sz[k]=$3;fr[k]=$5}
    }
    END{for(k in mnt)printf "{\"mount\":\"%s\",\"label\":null,\"fs\":\"%s\",\"sizeBytes\":%s,\"freeBytes\":%s}\n",e(mnt[k]),e(fs[k]),sz[k],fr[k]}' | paste -sd, -)

  # Network interfaces with traffic rates (bytes per second)
  NET=""
  for d in /sys/class/net/*; do
    n=${d##*/}
    case "$n" in lo|veth*|docker*|br-*|virbr*|ifb*|dummy*) continue;; esac
    op=$(cat "$d/operstate" 2>/dev/null); sp=$(cat "$d/speed" 2>/dev/null); mac=$(cat "$d/address" 2>/dev/null)
    rt=$(awk -v n="$n" -v dt="$DT" 'NR==FNR{if($1==n){pi=$2;po=$10};next}$1==n{printf "%.0f %.0f",($2-pi)/dt,($10-po)/dt}' "$T/neta" "$T/netb")
    inb=${rt% *}; outb=${rt#* }
    up=null; [ "$op" = up ] && up=true; [ "$op" = down ] && up=false
    item="{\"name\":$(str "$n"),\"mac\":$(str "$mac"),\"up\":$up,\"speedMbps\":$(num "$sp"),\"inBps\":$(num "$inb"),\"outBps\":$(num "$outb")}"
    NET="${NET:+$NET,}$item"
  done

  # Top processes by CPU use over the same one-second window
  PROCS=$(awk -v dt="$DT" -v clk="$CLK" -v page="$PAGE" '
    function parse(line,   f,r){ if(match(line,/\(.*\)/)==0) return 0; pid=line+0; nm=substr(line,RSTART+1,RLENGTH-2); r=substr(line,RSTART+RLENGTH+1); split(r,f," "); ut=f[12]+f[13]; rss=f[22]; return 1 }
    FNR==NR{ if(parse($0)) base[pid]=ut; next }
    { if(parse($0)){ d=ut-base[pid]; if(d<0)d=0; printf "%.1f %.0f %d %s\n", d/clk/dt*100, rss*page, pid, nm } }' "$T/proca" "$T/procb" | sort -k1,1nr -k2,2nr | head -30 | awk '
    function e(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);gsub(/[\001-\037]/,"",s);return s}
    {n=$4; for(i=5;i<=NF;i++)n=n " " $i; printf "{\"pid\":%s,\"name\":\"%s\",\"cpuPct\":%s,\"memBytes\":%s}\n",$3,e(n),$1,$2}' | paste -sd, -)

  # Services (systemd): active = Running, failed = Failed, anything else = Stopped
  SVCS=""
  if command -v systemctl >/dev/null 2>&1; then
    SVCS=$(systemctl list-units --type=service --all --no-legend --no-pager --plain 2>/dev/null | awk '
      function e(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);gsub(/[\001-\037]/,"",s);return s}
      $2=="loaded"{st=($3=="active")?"Running":($3=="failed")?"Failed":"Stopped"; n=$1; sub(/\.service$/,"",n); d=""; for(i=5;i<=NF;i++)d=d (i>5?" ":"") $i
        printf "{\"name\":\"%s\",\"display\":\"%s\",\"state\":\"%s\",\"startType\":null}\n",e(n),e(d),st}' | head -600 | paste -sd, -)
  fi

  printf '{"schema":1,"hostname":%s,"os":%s,"uptimeS":%s,"cpu":{"model":%s,"loadPct":%s,"perCore":[%s]},"memory":{"totalBytes":%s,"usedBytes":%s},"volumes":[%s],"network":[%s],"processes":[%s],"services":[%s]}\n' \
    "$(str "$HOST")" "$(str "$OSNAME")" "$(num "$UP")" "$(str "$CPUMODEL")" "$(num "$LOAD")" "$CORES" "$(num "$MT")" "$(num "$MU")" "$VOLS" "$NET" "$PROCS" "$SVCS"
  exit 0
fi

# ---- inventory ----
d() { head -1 "/sys/class/dmi/id/$1" 2>/dev/null; }   # some of these (serial numbers) need root and come back empty without it
MEMB=$(awk '/^MemTotal/{printf "%.0f", $2*1024}' /proc/meminfo)
NPROC=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo)

MODS=""
if command -v dmidecode >/dev/null 2>&1; then
  MODS=$(sudo -n dmidecode -t memory 2>/dev/null | awk '
    function e(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);gsub(/[\001-\037]/,"",s);return s}
    function q(s){return (s==""||s=="Unknown"||s=="Not Specified")?"null":"\"" e(s) "\""}
    function flush(){ if(inblk && size>0) printf "{\"slot\":%s,\"sizeBytes\":%.0f,\"speedMhz\":%s,\"type\":%s,\"manufacturer\":%s,\"partNumber\":%s,\"serial\":%s}\n", q(loc), size, (spd>0?spd:"null"), q(typ), q(man), q(pn), q(sn) }
    /^Handle /{ flush(); inblk=0; next }
    /^Memory Device$/{ inblk=1; size=0; spd=0; loc=typ=man=pn=sn=""; next }
    inblk && /^\tSize:/{ v=$2; u=$3; if(v ~ /^[0-9]+$/) size=(u=="GB")?v*1073741824:(u=="MB")?v*1048576:(u=="KB")?v*1024:0 }
    inblk && /^\tLocator:/{ sub(/^\tLocator: */,""); loc=$0 }
    inblk && /^\tType:/{ sub(/^\tType: */,""); typ=$0 }
    inblk && /^\tConfigured (Memory|Clock) Speed:/{ spd=$(NF-1)+0 }
    inblk && /^\tSpeed:/{ if(spd==0) spd=$2+0 }
    inblk && /^\tManufacturer:/{ sub(/^\tManufacturer: */,""); man=$0 }
    inblk && /^\tPart Number:/{ sub(/^\tPart Number: */,""); pn=$0 }
    inblk && /^\tSerial Number:/{ sub(/^\tSerial Number: */,""); sn=$0 }
    END{ flush() }' | paste -sd, -)
fi

DISKS=$(lsblk -dn -b -P -o NAME,MODEL,SERIAL,SIZE,ROTA,TYPE 2>/dev/null | awk '
  function e(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);gsub(/[\001-\037]/,"",s);return s}
  function q(s){return (s=="")?"null":"\"" e(s) "\""}
  { name=model=serial=size=rota=type=""; s=$0
    while(match(s,/[A-Z]+="[^"]*"/)){ kv=substr(s,RSTART,RLENGTH); s=substr(s,RSTART+RLENGTH); p=index(kv,"="); k=substr(kv,1,p-1); v=substr(kv,p+2,length(kv)-p-2)
      if(k=="MODEL")model=v; else if(k=="SERIAL")serial=v; else if(k=="SIZE")size=v; else if(k=="ROTA")rota=v; else if(k=="TYPE")type=v }
    if(type=="disk") printf "{\"model\":%s,\"serial\":%s,\"sizeBytes\":%s,\"mediaType\":\"%s\",\"health\":null,\"tempC\":null}\n", q(model), q(serial), (size==""?"null":size), (rota=="0"?"SSD":"HDD") }' | paste -sd, -)

GPUS=$(lspci 2>/dev/null | grep -iE 'vga|3d controller|display controller' | sed 's/^[^ ]* [^:]*: //' | awk '
  function e(s){gsub(/\\/,"\\\\",s);gsub(/"/,"\\\"",s);gsub(/[\001-\037]/,"",s);return s}
  { printf "{\"name\":\"%s\",\"driver\":null,\"vramBytes\":null}\n", e($0) }' | paste -sd, -)

printf '{"schema":1,"hostname":%s,"osName":%s,"osBuild":%s,"system":{"manufacturer":%s,"model":%s,"serial":%s,"biosVersion":%s,"biosDate":%s,"boardManufacturer":%s,"boardModel":%s,"boardSerial":%s},"cpu":{"model":%s,"cores":%s,"threads":%s},"memory":{"totalBytes":%s},"ramModules":[%s],"disks":[%s],"gpus":[%s],"apps":[]}\n' \
  "$(str "$HOST")" "$(str "$OSNAME")" "$(str "$(uname -r)")" \
  "$(str "$(d sys_vendor)")" "$(str "$(d product_name)")" "$(str "$(d product_serial)")" "$(str "$(d bios_version)")" "$(str "$(d bios_date)")" \
  "$(str "$(d board_vendor)")" "$(str "$(d board_name)")" "$(str "$(d board_serial)")" \
  "$(str "$CPUMODEL")" "$(num "$NPROC")" "$(num "$NPROC")" "$(num "$MEMB")" "$MODS" "$DISKS" "$GPUS"
