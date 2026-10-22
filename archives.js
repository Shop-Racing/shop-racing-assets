
(function () {
  if (document.getElementById("srbtn")) return;
  var b = document.createElement("button");
  b.id = "srbtn";
  b.textContent = "ARCHIVES AUDIO";
  b.style.cssText = "position:fixed;top:90px;right:20px;z-index:999999;background:#ed650d;color:white;padding:15px;border:0;border-radius:8px";
  document.body.appendChild(b);
})();
