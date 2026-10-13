<script>alert("never execute")</script>

[危险链接](javascript:alert(1))

<img src="x" onerror="alert(1)">

```mermaid
%%{init: {"securityLevel": "loose"}}%%
graph LR
 A --> B
```
