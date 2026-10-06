import fs from 'node:fs';
const file='apps/desktop/shared/demo-en.json';
const labels=JSON.parse(fs.readFileSync(file));
Object.assign(labels,{
 '缩放':'Zoom','第':'Page ',
 '关系图谱':'Note Relationship Graph','全局':'Global','局部':'Local','查看邻居':'View neighbours','个节点':'nodes','条链接':'links','个连接':'connections','已有笔记':'Existing note','空心':'Hollow','实心':'Solid','拖拽移动':'Drag to move','滚轮缩放':'Wheel to zoom','已连接上下文':'Context connected','正在工作':'Working',
 '也可以输入或修改你的讲解':'Or type and revise your explanation','文字讲解':'Typed explanation','用自己的话解释，并说明适用条件。':'Explain in your own words and state the conditions.',
 '按下面的按钮开始讲':'Explain it in your own words','信息':'Info','链接':'Links','设置':'Settings','试试：':'Try this:',
 '让 AI 在你的资料库里干活。它能读、能写、能改你的笔记。':'Ask AI to work in your library. It can read, create and revise your notes.',
 '把这篇笔记整理成大纲':'Organise this note into an outline','给这个库里的英语笔记建一份索引':'Create an index for this library','把这份讲义转成练习题（Markdown）':'Turn this handout into Markdown exercises',
 '理论概率':'Theoretical probability','抽样频率':'Sample frequency','预测或计算的数值':'Predicted or calculated value','推理或预测依据':'Reasoning for your prediction','实验观察与解释':'Observation and explanation',
 '上一页':'Previous page','下一页':'Next page','重置缩放':'Reset zoom','适应':'Fit','放大':'Zoom in','缩小':'Zoom out','准备中…':'Preparing…',
 '折叠文件栏（Ctrl+E）':'Toggle files (Ctrl+E)','折叠右栏（Ctrl+B）':'Toggle assistant (Ctrl+B)','重新加载':'Reload','用自己的话讲清一个知识点':'Explain a concept in your own words',
 '独立通过':'Independent pass','没完成':'Incomplete','暂无记录':'No records yet','文件夹':'Folders','费曼学习法的做法是：假装你在给一个完全不懂的人上课， 把知识点用自己的话讲一遍。':'Explain the idea as if teaching someone new to it.',
 '讲的时候不用怕说错 —— AI 会指出你漏掉的关键点、说含糊的地方， 并追问你最薄弱的地方。':'AI identifies missing conditions and asks you to explain further.'
});
fs.writeFileSync(file,JSON.stringify(labels,null,2)+'\n');
