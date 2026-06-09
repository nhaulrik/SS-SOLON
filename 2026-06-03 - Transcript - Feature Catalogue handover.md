# Feature Catalogue Handover Transcript

_2026-06-03_

**Speaker 1:** We can just dig into it, so it's...

**Speaker 2:** Mm.

**Speaker 1:** You know the story, right? But just for the sake of a recap, I was tasked to do this feature catalog based on all the information and the roadmap in Jira. And quickly I realized that this is quite a significant task to do. I would be okay doing it manually once, but after I learned that this is going to be a repetitive thing to do, yeah, frequently over the over throughout the year, I thought we we might want to automate it in some in some way, and then that sparked.

**Speaker 2:** And I did this. I talk with my. But I... To me that. Like.

**Speaker 1:** this idea of having Cortex or even an arbitrary AI help generating some HTML files, which would be served as the catalog.

**Speaker 2:** Talk. Same. What? It is.

**Speaker 1:** So that's how it started. And it's not polished. I would still call it a proof of concept. It works, but it's also a bit quirky. So that's how it is. But this is where it all starts. So it's called Solon's Live Studio.

**Speaker 2:** The. It's so. See you.

**Speaker 1:** also AI stuff, right? But, and let me just check if I am on the VPN. I am. Okay, so it works this way. You can create a project and everything is in the Git repository, so you're able to share it. I also already did a test with Daniel, where I shared, or he cloned the same repository, and then he was able to generate on the same stuff that I was doing. So that was actually quite nice. The feature catalog right now is version 3 here. I also have some sandbox stuff going on. But if we just open this, Then this is what it contains. There are some steps here to the entire process. First thing is called the flow, a flow, and a flow is bound to an HTML template. So what I've done is I have asked AI

**Speaker 2:** Mm.

**Speaker 1:** Cortex or whatever you want to use, basically to create an HTML page and use that as a template. So in this case, I prompted it to create a page for, what do you call it, roadmap groups, I believe it's called, initiative groups, that's what I was searching for.

**Speaker 2:** That's no sort of, yeah.

**Speaker 1:** So, and then I instructed it basically on stuff to use, and then it came up with this template here after some revisions. And this file is within the project as well. I can just see if I can find it out here. So if I go in here, I have

**Speaker 2:** I love this. That's me.

**Speaker 1:** Projects, I have version three.

**Speaker 2:** We discussed it with.

**Speaker 1:** And then I find all the flows. But actually the template is actually cross project. So I think it's actually in, let me just check here. It's in the template folder out here. So initiative group is the one. So I have some versions to it. The last one is version three.

**Speaker 2:** But. But the issues. But this was that they're having it. They would have.

**Speaker 1:** And this is the the void for this template. And as you can see, it's somewhat interactive. You can do some scrolling, you can click around, you can even prioritize, sorry, sort the tables. And basically, you could refine this as far as your imagination goes, right?

**Speaker 2:** Yes.

**Speaker 1:** Also, thinking about whether we should enable you to click maybe an initiative and then see a dialogue explaining what it is and such. But that's an endless hole, right? You can dive into. The point is, you define a template file.

**Speaker 2:** I need the list to make sense.

**Speaker 1:** and that is called a flow. And then you can use that template to generate content. So in this case, we have the initiative group. The objective for me was to generate an overview across PIs, so for PI 28, 29 and 30, and then generate all the stuff that goes within the initiative groups for the entire year. So that's what you see here. I have free flows that are bound to this template. So if you just take the first one, the 28 one here, then there is some functionality here where you can actually, it's not too important for now, so we might just skip it, but there is actually a possibility here to to view the entire DOM tree and also select specific elements within the template that you want to apply an instruction to. So for instance, I'm not sure if you can see it, but when I move across here, it highlights elements. So here it highlights this header section. So it could be that I wanted to instruct something specific here that

**Speaker 2:** Mik. Mm.

**Speaker 1:** keep this as is or something like that. There are some possibilities to do that. It's something I played around with, but actually when I started generating stuff, I also found myself not using that part that much. So to some extent, you can consider a legacy. The important thing is these two toggles here. So first one is repeatable. What we mean here is that we have one template file. It's a single page. With this toggle, we tell the AI that we expect the AI to create multiple instances of this template.

**Speaker 2:** And without cost, there is.

**Speaker 1:** Does that make sense? Yeah, so in this case, it's one instance for each of the groups that it will find. And generate full slide is a default toggle on as well. We wanted to look at everything here.

**Speaker 2:** Have to. I love your son.

**Speaker 1:** Then we hit next, and now we are going into the place where we will prepare the AI. This is by far the most complex thing, at least when I designed it, because it didn't really work that well, so to be honest. But everything is bound to a context. So we want the AI to have the full context within the project here on the, if you just go in here, we should be able to see that within the project, That should also be, what is, where is it? Projects V3. AI context. There's a folder where you can basically put all your documents or whatever it is. In this case, everything I need is contained within a single spreadsheet. It's quite a big spreadsheet because it's, I'll just open it up here on the other side, because it extracts. The entire roadmap from Jira. and does some a few modifications to it. But basically this spreadsheet is that is the source of everything that we give to the AI. So as you can see here, we have all the features also enriched with descriptions and it also hides a lot of stuff here. So it's actually To start to count it up, it's quite a lot that is being provided here. Then, one thing to be very aware of is... Yeah, for sometimes you would like the AI to, for instance, give all the estimates, right? Estimate, give me the full estimate for this roadmap group. But it's really bad at doing that. Everything that comes, that ties to numbers is is going into hallucinations. So I had to expand the sheet here to also explicitly tell it the numbers to use, because it can actually do that, but it cannot calculate them on its own. So here, for instance, I have the request the stats. It's all based on this one, and it's also tied into it, so it will update and propagate. But here you can see if across the PIs, what estimate comes from the different requesters. Similarly, if you go into initiative groups, that's here, I do some counts. How many initiatives do we have within the different groups? Also, how many features do we have and what is the estimate? So

**Speaker 2:** Hello. I don't like the mental. I think like it.

**Speaker 1:** basically just carving it out in stone, right, the numbers so that it doesn't have to invent anything on its own. So that's basically what you need to do as preparation, right? You need to have your context straight before you can do it.

**Speaker 2:** Sing. I'll fix all the light we have. Is it? And my. And thirdly, this is running on data right, so when we're moving the toolkit, I'll just make sure that the queries target toolkit to get the same information.

**Speaker 1:** Yeah, yeah, I think that's actually going to be fairly easy to do that. Right? As long as we can get into spreadsheet, it's fine.

**Speaker 2:** Yeah, it it just... Yeah. Sounds good.

**Speaker 1:** Yeah. So that's one thing. Then the next thing is a concept I had to introduce here. So you might imagine now that this is quite a big file. And if we want the AI to generate content,

**Speaker 2:** Yeah.

**Speaker 1:** it might blow up when you feed it with the entire file here. There is a lot of stuff with the token economy and there are limitations to how much you can provide and all that stuff. Initially, I didn't have any issues because I was only looking to create overview of PI28. But when I was tasked to do it for 26, So all of the PIs, it blew up. It couldn't handle it. So I had to figure out how can we actually manage the context. And that's where this concept came into place. So when we provide the context file, We also have the template, right, the HTML template. Then the next thing you need to do is you need to tell the AI instructed based on the template on what information is actually important. So that's where we have this, I call it slice output template, in lack of a better name.

**Speaker 2:** Mm.

**Speaker 1:** But there is one per template. And if we go in here and open it up, so this should hopefully work. It's a text file, and if we take the look at the initiative group here. See if I can get that up. Then, yeah, here it is. Then this is an instruction to the AI. So whenever the AI is going to look at the context files, it will also look at this one to basically to know how to go about it and how to approach it. So as you can see here, it says something like, I'm preparing a single slide for the Steaco. It describes the 26th roadmap. Actually, this is the wrong one. Let me just take the different one. This one, maybe, yeah. I think I corrupted the other one. So this is how it should look like. So there are some rules here. So this instructed on how to look at the context file. I would say that. Ideally, in an ideal world, you would actually embed these instructions directly into the HTML template so that you have those going together, right? You have both the templates that you view in the browser, but the file also contains some metadata that the AI needs to look at.

**Speaker 2:** But... This looks like a skill, right? This could be interchangeable with a skill.

**Speaker 1:** Yeah, probably. And I also had the AI write it and then I just tweaked it, right? The thing to be really aware of here is that, for instance, it says here for request a stats, you need to look at this sheet. So this is a reference, right, to request a stats sheet within the spreadsheet I just shared before.

**Speaker 2:** Lê.

**Speaker 1:** and then it mentions the columns and then it states very explicitly, to get a value, find the single row matching both PI and Requester, read the estimate directly. If no row exists for a given PI, treat it like zero. Basically, what you do here is you avoid the AI,

**Speaker 2:** The. Start with. Yes, we do.

**Speaker 1:** to hallucinate, because that is what it will probably do if it has no clear instructions. But as I mentioned, ideally this would be embedded into the HTML file, but it isn't at this point.

**Speaker 2:** Of. That's that's right, yeah.

**Speaker 1:** Then the next field here is optional custom instruction. If I wrote here, translate everything into German, then you would get a slide where most of the content would probably be German. I don't actually have any use case for it right now, so it's just optional.

**Speaker 2:** But with this, when I look at this recipe, right, because right now you have 2026, and you've generated all the PIs. And but with this, I could potentially have it only generate PI 29, regenerate PI 29. I could also have it potentially only generate 2027, for example.

**Speaker 1:** The Filip. Yeah. Yeah. Yes. Yeah, that's how it goes.

**Speaker 2:** Yeah, and...

**Speaker 1:** Yeah, and I'll show you that in a moment, actually, how much, because it's not just one click and then you get the feature catalog. That's not how it works. You need to, for instance, the feature catalog is comprised of three different templates. There is this front page overview that shows the full year, and then there are the group summaries.

**Speaker 2:** Okay. No. Mik.

**Speaker 1:** And then there are all the initiative summaries under the group. So we have three different types in play. And you actually need to generate the groups for each PI and then also the initiatives for each group as it is right now. And when I did it, It took me 15, 20 minutes or something like that to do it from scratch. But I also know the tool right. And I still think that is way less than if we were just to wait half a year and then extract everything by hand and interpret and update everything.

**Speaker 2:** Yeah, of course, of course, and it could probably cut down if I only needed to regenerate certain parts of it.

**Speaker 1:** Yeah. Yeah, certainly, certainly. So the next thing here is grouping. So we have the entire Excel spreadsheet here fed into the AI. And that is a problem because you don't really have control. There are limitations to the AI.

**Speaker 2:** Yes.

**Speaker 1:** it can only take a certain amount of input characters and tokens. So basically, at some point, you'll reach a cap. I reached it here when I tried to generate stuff based on the full file that contains the entire roadmap for 26. So you need to be able to manage that. And you can do that here.

**Speaker 2:** Yeah, I remember it.

**Speaker 1:** So we are still going here to create initiative group summaries for 28, PI 28. So the thing here we want to do is we want to apply a grouping column. That is the initiative group. This one reads from the spreadsheet that you just saw. So these are all the columns.

**Speaker 2:** Yeah.

**Speaker 1:** So, we know that the... Yeah, the grouping column here is the initiative group. We expect an instance for each one of those. Then in order to only look at the PI 28 stuff, we click add filter. This one also reads from the spreadsheet. So here we find PI, then it displays the items, and we are only interested in PI 28. So now what happens is that it takes... This entire sheet applies a filter to it and only feeds in whatever matches that criteria so that we only provide the context that is actually needed.

**Speaker 2:** So, we are doing pretty little, so the total. Mik.

**Speaker 1:** Yeah, you follow?

**Speaker 2:** I found it nice. I'd say you say you say this is like a pock, but it's actually a bit more user-friendly than I would say a pock is. It's...

**Speaker 1:** Cool. I've also spent a lot of time on it, I'll be honest with you. But

**Speaker 2:** But I can see, I can see that it's...

**Speaker 1:** But the next step is now we're actually ready to interact with the AI. We have the template set up, we have all the filters set up, the context and all that stuff. So now we say generate with AI. First thing it does is that it looks through the spreadsheet, applies your filter, and then it mentions here okay, I found the six unique instances based on your filters and these are the ones. So this means that it will create 6 slides or 6 HTML pages with these individual roadmap groups, right? If you want.

**Speaker 2:** And then... Thanks. That makes sense.

**Speaker 1:** You can also click at these.

**Speaker 2:** Like.

**Speaker 1:** then you will actually see a summary. So this is the AI generated. So it has basically taken the entire spreadsheet and then extracted and interpreted everything for non-functional requirement coverage in this case, and put it into this. So in a moment, when we ask it to generate an HTML page, Then it will parallelize the request to different AI agents. There will be one agent per page that it's going to create. And then this is the context that it will supply. So let's just try and do it. Accept and generate. Then it boots up six agents.

**Speaker 2:** Yes. Things like that.

**Speaker 1:** five at a time, so it's in batches, and these agents will create one of these previous mentioned slides each, and then you can just follow along here.

**Speaker 2:** Rehder. Is to make sure. How do you decide on which model it uses?

**Speaker 1:** It's hard-coded right now to use Haiku, the Claude Haiku one. Sometimes, if you're only going to create, it depends on the content. Ideally, you would use the Sonnet. It's the best at reasoning, but it's also more expensive. And in this case, most importantly, it's slower. So

**Speaker 2:** Next.

**Speaker 1:** If you ask it to generate a ton of lights, then there is a high chance it will time out before returning.

**Speaker 2:** And what's your success rate with? Have you tried Quen, for example?

**Speaker 1:** No, I haven't. It was introduced after I actually did the latest revision, but I think we can do that easily. But if you, when we're talking about...

**Speaker 2:** Okay. Yeah.

**Speaker 1:** Token economy.

**Speaker 2:** Huh.

**Speaker 1:** There is a huge difference between running a local environment where you are, development environment where you are programming and vibe coding compared to what I'm doing here, because I'm providing a fixed context, a fixed template, and then I'm asking the AI to, yeah, to figure it out.

**Speaker 2:** Just to piece it together, yeah.

**Speaker 1:** Yeah, so if you want to, if you're considering how many tokens does this actually cost, I think this is the first, no, I actually did a few more generations today already. Nonetheless, I'm using this one and I'm only at 2% for today.

**Speaker 2:** Okay.

**Speaker 1:** I'm not sure if you were how familiar you are with the with these.

**Speaker 2:** No, I am, I am. I burn, I burn through my tokens like there's no tomorrow.

**Speaker 1:** Yeah, exactly. But well, if I ask the AI to generate some, even a small feature, it's very likely that it will burn a million just doing that in a few minutes. And here I've actually created lots of slides and we're still at 2%. So it's quite efficient. But now it actually generated stuff. Sometimes since we are asking the AI to do stuff, sometimes it will fail. It will most likely be just a single agent that fails and then everything else works. I have tried to implement some retry mechanism where the single agent that is failing can be retried. And I'm actually not entirely sure if it works, but we'll figure that out. Otherwise, the approach is just to try again, right, for all of them. That's how I've done it. But now we apply context or content. Now it has taken the template slide that we saw initially. and generated six of those based on what we saw just before. And if we just scroll through it here, just doing a sanity check, that it looks all right. Seems like nothing is broken at least, so that's quite good. Then what I'm doing on the side, since we are still kind of a POC here, is that I have used to take these key numbers and put them in a split screen. And then I have added the possibility in here to actually being able to to update directly. So just go through them, make a sanity check, and then update the numbers and ensure that it looks right.

**Speaker 2:** Okay. Yeah. Yeah.

**Speaker 1:** Hopefully, it is correct.

**Speaker 2:** Okay, so it pulls all that, if I look at this, for example, I mean, the left right there, audit logging, all that stuff, it's pulled from just a summary of the initiative, I guess, on the Epic. But how does it actually, yeah, how does it actually...

**Speaker 1:** Yeah. Yeah, yeah, exactly. Descriptions and all of it.

**Speaker 2:** So how does it actually reason the market value and all that? Is that documented somewhere or is that just business value market relevance that that document somewhere or is it something?

**Speaker 1:** I think it has, what is it? I think there is a... Something described. within some of these, at least. But it comes from here. Let me see if I can just find a quick one. I think I saw something where there was something called the benefit hypothesis, something like that, something in Jira where it was, and also acceptance criteria, these things.

**Speaker 2:** Okay, nice.

**Speaker 1:** But it is something that the AI deducts from these fields. And you can expand these as well, right, if you want.

**Speaker 2:** And.

**Speaker 1:** But generally, the most important stuff is who requested these things, what is the priority, what is the effort, and so on. And there's a UI bug here. It's not exported, but if I go over these, you can see they are becoming white. But that's how it is. Small thing.

**Speaker 2:** Yeah. Yeah, but that's, I mean, as long as it's not in the export right, so then it's fine.

**Speaker 1:** Degn. Yeah, so now we have generated 6 slides and we want to save those. So we hit next. Then we get to this bit rough step, assigning metadata. The idea here is that you want to package the stuff that you just exported within, yeah, as a single export. So if we just go up here, we can name the export and call it test export. Then you can also name the slides. at the ideally these should be named after the instance names, right? So non-functional and so forth, whatever we had, core revenue management, etc. But and I had it working, but then I something broke and now it doesn't work anymore. But it's not too important here. So we named the export. And then we stay package. Done, then we hit done. Now we completed the flow and we have generated 6 slides. Next step is to go into the editor. It's not too important, but in here we should be able to see, unless I broke something, there's also a good chance I did that.

**Speaker 2:** It.

**Speaker 1:** Where is it? There it is. We use the 28 groups template. We call it test export and it has six slides. In here. You can actually see the code. There's also a preview, but it's a bit buggy. Nonetheless, the intention of this step was that if you wanted to adjust something, you could do it, but it doesn't work that well. And I would actually say if you want to change it, then you might as well just open up the HTML file from the export within your code editor and then update the numbers. That's probably easier to do. But let's go to where things get a bit more interesting. So let's say now that you have completed all the flows here. So in this case I have completed the group flow for PI 3029 Twenty-eight. Then I've also generated all the initiatives for PI 30, 29, 28. So as you can imagine, these are a bit more crazy, right? Because when you ask the AI in this case, it's not going to generate 6 slides. It's going to generate 30. So this is where we push it a bit. But it came through, so it worked. And then I've also created the front page here. So if you go into the published stuff, this is where we need to actually construct the feature catalog. So from the exports, we get all the pieces. Now we need to stitch them together.

**Speaker 2:** And.

**Speaker 1:** into a structure, right, that we can navigate and fold out and such because the exports on their own, they don't actually know anything about that. They are just flat files. So going into the published stuff, you can make multiple structures. I just call the feature catalog up here.

**Speaker 2:** Yes.

**Speaker 1:** but we could create a new one. Then the idea is that you take all the exports that you have done out here. You can apply groups and structure it so that it's a bit more than just a flat list. And then you need to create a tree structure. And this in here is resembling what the output feature catalog is going to work in terms of navigation and basically how you interact with it. So in this case, I want the overview, which is the front page, to be the very top item. It's up here. It's drag and drop, so I can just drag it in here. Now I'll get two front pages. I don't want that, but you get the drill. Then you can also add these sections in here so that you can group stuff. In this case, it makes good sense to group on the different PIs, but I could also create a new one and Yeah, here it is, and then name it something, right? So basically, you build the entire structure here. Then you take for PI 28, go in and find non-functional requirement coverage. Then you drag all of those out here. I think you can do it, actually, including the children. Otherwise, you have to check them, toggle them all here. I cannot really recall. And if you need to nest something, as you can see here, non-functional requirement courage is the group. These are the initiatives. They have to be children, right? If you want to group further for whatever reason, then you can also do that. So now I just grouped maintainability under extensibility. But By using these arrows out here. So you fiddle around here, you come to a nice structure, and then at some point you're ready to publish. So we do that here. The publish needs a name, just call it something random here, or post fix it with something random. It's published. Then we can go to presentations. These are the feature catalogs that I have generated a presentation for. The presentation is the end result. And the one we just talked about is the top one. So if I click that one, we should get a preview here of what it's going to look like. As you can see, we have the front page first, then we have sections for the different PIs. and also the initiative groups and so forth. This one is also packaged within the, let me just find it here, within the project. So if you go to Bjørn, there is a folder called presentations. This is the one we just talked about. And if I open this one, I get it in the browser.

**Speaker 2:** Okay.

**Speaker 1:** So, this is the end result, right? Then one final thing that I didn't get to spend time on, but it's still in the backlog, you could call it, is this navigation stuff, right? all the slides that need to be wrapped in something, right? And the wrapper includes this, the UI for this navigation out here. Also the buttons here so that you can collapse it, right? Also the navigation down here go back and forth between slides. So basically something that contains the entire presentation. This is of course also a template. So if we go in to the project here, let me just find it. On the templates. Then I have something called publish. And this is the wrapper, the template for the wrapper. So the one that we're using right now is this one. And if I just open it, you can see it's basically everything except for content.

**Speaker 2:** Mm.

**Speaker 1:** So if you wanted to use a different theming or whatever, then this is the file to edit, right? I didn't include it into the app as something that you could manage so that you could switch between different presentations, styles and such. So this is basically hard-coded for now. But I did have different ones. So you can see this is an older version. It's slightly different with some icons out here. I also have... Added, that's the same one, but yeah, that's basically the templates. And then as you might also notice, these elements here, when you have all this interaction stuff, it requires also a certain amount of scripting, right, JavaScript. So that is also embedded within the template, within the single HTML file. And... It's a bit, I didn't write anything on my own. I had the AI help me doing all of it, but it would be wrong to say that it was easy. So I had a lot of trouble with it. But at this point, now, let's take a look at the output again. So we find the

**Speaker 2:** Mm.

**Speaker 1:** It's all on the server side, it's on the project, V3 and presentation and feature catalog, that one. So. If I open the index file, it will read the context from basically this folder. And these are all the content slides that is bundled in here. There is a current issue. that if you want to, if you want to post this on the toolkit, then you basically cannot just put all of these files into the toolkit and then expect to open it as an app. That's not how it works. If you go do that and you open it, it will just download the files, right? So what you actually need is something to host it. as a web app. And I'm not, I didn't really figure out how to do it or if it's even possible. I know that Daniel has been looking into it for the org chart, but I think he reverted back to do the approach that I did. So how it works is Let me just go into the toolkit, find the feature catalog. And hope that it's still working, or is it there?

**Speaker 2:** Uh, I checked it earlier, so it should work.

**Speaker 1:** Nice, yeah, so yeah, there is, there it is, so in order to get it in here. There is one more exercise you need to do, and it's not supported in the app, but it could be. It's just a matter of implementing it. But basically what I have done is I used the open code or whatever AI, basically just an AI tool, and then I say, take everything in this folder and package it.

**Speaker 2:** Høg.

**Speaker 1:** into a single self-contained HTML file.

**Speaker 2:** Ohh.

**Speaker 1:** So then it will take all of this and just put it into a single file, which is 5 megabytes or something like that in a single file, it's getting pretty big. And then within the feature, sorry, within the toolkit, the way it works is that, let me just edit the page. There is a plugin or a component called Script Editor, and that's the one we're using. And when you add that one, you get the possibility to edit snippet. And then I basically take the entire bundled HTML and paste that snippet into the dialog here.

**Speaker 2:** Yo. You do get the.

**Speaker 1:** Yeah, now it almost froze the page, right? So it's pretty heavy. So yeah, even you even need to wait for it to respond, but it will respond. So that's how far I got. I actually talked, I cannot even recall who it was, but I tried to investigate it if we could do it differently. And the way it should ideally be handled is that we would get somewhere in NC where we can host it on SharePoint and then point towards the directory and then it will just get everything from there. But I just caught a corner here. But basically everything is this code here. and you can see I scroll, I scroll, I scroll, nothing happens out here. So it's huge. And then eventually you get it in here and then refresh the page and then it works. So that's the process end to end. And

**Speaker 2:** Høg. But.

**Speaker 1:** What have I missed? What have I missed?

**Speaker 2:** But you also use this to generate the templates, right? To some degree.

**Speaker 1:** Yeah, but I do that outside of the tool.

**Speaker 2:** Yeah, you see open this up when you open open code in the templates folder and just say, take inspiration from these slides and the graphic and then I want this instead.

**Speaker 1:** Yeah. Yes, and I would say that... The first time took quite a lot to do it. But if you have a reference example, so if you just provide it with an existing example of a template and say, I need something similar structure or similar approach as this file, give me that, then it's much easier. But I had to play around a little to get it to work. But basically, the end result here is that everything here, as you saw, is persisted in your project folder. So if you go ahead and clone the project into your machine, then you will see the same projects here.

**Speaker 2:** Okay.

**Speaker 1:** You will also see the V3 here, and we would be able to generate content and also share it. Then, let's...

**Speaker 2:** I see a lot of uses for this. I see already now that we're going to have this used as our presentation of the next coming scope we expect.

**Speaker 1:** Yeah, that sounds really nice. So, and I think when I when I did it initially, I'm not sure if Mik is, I think it's too long time since Mik was doing any code, but I saw a lot of usages of actually having this inversion control, because the thing is, right now I have my context. in control. I also have the templates in control. So let's say that for the next iteration here, you want to add an extra field to the initiative group here. Then you would go in to the project, open up the template, and then edit the file, and then make a pull request to get it merged. And then whoever works in your team

**Speaker 2:** There was some new fans.

**Speaker 1:** who is also doing generation stuff, they would just get the change right. So next time they generate a new slide, then they would get the new field that you just mandated.

**Speaker 2:** Okay. Storm. But I could easily do that because I am a maintainer of the Solon Tax Azure DevOps. So I can just create a repo for this.

**Speaker 1:** Yeah, yeah, exactly. So that's it, and right now it's in my own GitHub because I didn't have anything else, but so you should probably...

**Speaker 2:** And then we can, because I'm guessing you're going to bring this over to Luminous as well.

**Speaker 1:** Yeah, so that's the intention. I think it's just a matter of time when Mik wants a feature catalog there as well.

**Speaker 2:** And I think we probably have, because with the extension that needs to happen here, from what I gather so far, is we need to have a couple of them actually. We need to have, so we have requirements from the contracts connected to the features or the capabilities that we're delivering. So which capabilities are linked to what contract for the countries?

**Speaker 1:** Yeah. Yeah.

**Speaker 2:** We want to have approved yearly budget in this one compared to what the total hours now are estimated.

**Speaker 1:** Mm.

**Speaker 2:** Uh... And then. and has a summary on the additional costs that are outside, outside of the feature deliveries or capability deliveries, right, or initiatives. And I think all of those are relevant for Luminous as well.

**Speaker 1:** Yeah. But the. Yeah, yeah, it sounds like it's the exact same thing.

**Speaker 2:** So it sounds like we should just work from reposter, and if we figure out that we are straying apart, then I guess we have two branches.

**Speaker 1:** Yeah, so we definitely need to figure out how to how to do that, and as I say said, it's a...

**Speaker 2:** Mm.

**Speaker 1:** I'm not a UX guy by any means, but I think it actually looks quite nice.

**Speaker 2:** I think it looks really good. I'm not a US guy either, so maybe my opinion is not the strongest, but it's from a presentation point of view, I think it gives the very good overview of all the information you need.

**Speaker 1:** Yeah, yeah, that I'm happy to hear that, because I'm also very biased, right? I, I, because I started it out and it looked like **** in the beginning, so, but...

**Speaker 2:** Yeah. No. Yeah. But it looks nice and it's very, from what I can see, it's actually very good to work with. And I was, I think, when I first heard about it, the one thing I was a bit question was, do I need to regenerate it every single time? So when we went to 2027, I need to generate it for 2027 and 2026, but I don't.

**Speaker 1:** Yeah, yeah. So let's say, let's use the example that you mentioned before that let's say that the PI 30, right, it's out in the future. It's probably going to look different when we approach it, right? So let's say that you want to just update the PI 30. Then what you would do here is that you would go into the PI 30. initiatives here. and then perform this flow again.

**Speaker 2:** Mm.

**Speaker 1:** Create an export, and then go into the into the publish here, find the export that you just created for the updated PI 30, pull it into the structure, remove the old stuff, and then publish again, right?

**Speaker 2:** Degn. But.

**Speaker 1:** And you could probably... There are numerous ways to improve it, also in the user-friendliness and all of that stuff, so you could probably do it even more automated, but that's far I got before I was pulled out.

**Speaker 2:** Let's see if I have time, let's see if I have time for that. Apparently, I have a delivery board promise and a exterco promise I need to deliver on within this month.

**Speaker 1:** Yeah, yeah.

**Speaker 2:** Ms. Yes.

**Speaker 1:** Around it with yourself, yeah.

**Speaker 2:** Yeah, I was actually going to, if you can send it now, I can just play around with it because I do want to play a bit around with it. Because I think one of the best things with this one is also because I need to start getting an overview myself and I'm going to get that from this, from what I can see.

**Speaker 1:** Yes. OK, so I shared the GitHub, but it's my GitHub, so...

**Speaker 2:** Thank you.

**Speaker 1:** The OK, did you already have a Azure DevOps repo?

**Speaker 2:** I can look into creating one right now, as we speak, but yeah, I can.

**Speaker 1:** If you can create it and allow me in, then I can push it.

**Speaker 2:** Yes, let me, uh, let me create it and I'll send it to you and you can just push it there.

**Speaker 1:** Yeah, yes, then then you can can just pull it in or clone it and start your own on your own.

**Speaker 2:** OK, OK, let me check into that, and I'll get back to you. I got to say why I create a repo, it's yeah.

**Speaker 1:** Yeah, yeah, no worries. Don't worry, but I think that is... That is the quick walkthrough here. It's a... When I started doing it, I actually didn't really, I had an idea, but I didn't have the full journey in my mind yet, right? It was something also invented along the way. So there are definitely steps in here that you could potentially remove and make it even simpler. For instance, the stuff where you edit the DOM tree and all of that stuff,

**Speaker 2:** Okay.

**Speaker 1:** It might become too technical. It's not something that you would even do within the app here. You would do it somewhere else. But. Yeah, just to say that it is a refined POC, let's call it that.

**Speaker 2:** Yeah, that's nice. That's very nice. Great, thank you very, yeah, thank you.

**Speaker 1:** Cool, but let me know when you have the repo, then let's see if we can get it. And then if you can also clone it and get it up and running, that will be the first step, right?

**Speaker 2:** No. Yes, yes, I will. That will be the first one. I think that's my first goal here. Just try to generate the same thing. That's already there. Okay, it looks like there's a new rep. I need to figure out who the owner for this one is. Otherwise, I have one, but it's supposed to be dead, so I'm not sure when they're going to.

**Speaker 1:** Yeah. Who is the dancer? Yeah, yeah.

**Speaker 2:** Kill that subscription.

**Speaker 1:** You figure it out and then let me know.

**Speaker 2:** Yeah, I will. Okay, thank you very much, Nikolaj. This, whatever this issue of credit here is actually such a great tool. It's a time saver, to say the least.

**Speaker 1:** I really hope so. I really hope so. But it also just kind of took off, right? Because I was, I told Mik that I have this idea to do this. And then he said, well, as long as you can do the feature catalog, then I don't care about the tooling. And then suddenly I promised to do something, do two things, right?

**Speaker 2:** Yeah.

**Speaker 1:** both to deliver a tool and also the feature catalog. So I had some, I think for three weeks, I worked day and night, literally, to get it up and running. So it was a bit stressful, but it worked out.

**Speaker 2:** Well, it was it was a gamble, but it seems like it paid off. Well, I don't know how much to spend on this token-wise, but I would say it's paid off.

**Speaker 1:** Yeah, so that's actually quite funny because I was asking about the token economy and all of that stuff. What is the bill for this? And I remember Daniel, he was painting this picture that it was really expensive, like plus $100 per day for the tokens. But then I think last week or something, two weeks ago, Michael showed me some of the bill and I think he mentioned that I had only spent, what was it, $500 or something? And I was just like, okay, that is really cheap.

**Speaker 2:** Okay. Let me, let me spend more.

**Speaker 1:** Yeah, then then I don't have any any any bad feelings at all, but it is a crazy thing to do this agentic AI. It's really crazy how much you can do in in a short time. It would it would have taken months, months, months, months to do it. It would be really difficult to.

**Speaker 2:** No, I understand. But this would have taken forever to Bille. Ohh.

**Speaker 1:** To raise the proper business case.

**Speaker 2:** I know you would never get the budget for that.

**Speaker 1:** Yeah. No. Can I get to spend half a year doing this tool? It might or might not work. Sure, go ahead. But yeah, let me know if there is anything and let me know when you have the report and let's see if we can get it on your machine as well.

**Speaker 2:** Høg. Ohh. That sounds good. Okay, thank you, Nikolaj. Have a good day.

**Speaker 1:** Of course, you too, bye.

**Speaker 2:** Bye.
